import { GameEngine, Player, Move, GameState } from '../game-engine'

// Spy Game Specific Types
export enum SpyGamePhase {
  WAITING = 'waiting',
  ROLE_REVEAL = 'role_reveal',
  QUESTIONING = 'questioning',
  VOTING = 'voting',
  RESULTS = 'results',
}

export interface QuestionAnswerPair {
  askerId: string
  askerName: string
  targetId: string
  targetName: string
  question: string
  answer: string
  timestamp: number
}

export interface SpyVote {
  voterId: string
  targetId: string
}

export interface SpyGameData {
  phase: SpyGamePhase
  currentRound: number
  totalRounds: number
  location: string
  locationCategory: string
  spyPlayerId: string
  playerRoles: Record<string, string> // playerId -> role
  votes: Record<string, string> // voterId -> targetId
  questionHistory: QuestionAnswerPair[]
  scores: Record<string, number>
  allLocationNames: string[]
  spyGuessedLocation?: string
  phaseStartTime: number
  questionTimeLimit: number // seconds
  votingTimeLimit: number // seconds
  currentQuestionerId: string | null
  currentTargetId: string | null
  pendingQuestion: string | null // Temporary storage for current question
  playersReady: string[] // For role reveal phase
}

/**
 * How long the role reveal waits for every player to press ready (#1277). The
 * reveal had no clock, so one seat that never readied – a player whose leave
 * lost its conflict check twice stays marked active – held the round for good.
 * A minute, like the vote: reading one card takes seconds, and the card stays
 * on screen through the questions.
 */
export const SPY_ROLE_REVEAL_TIME_LIMIT_SECONDS = 60

export class SpyGame extends GameEngine {
  constructor(gameId: string) {
    super(gameId, 'guess_the_spy', {
      maxPlayers: 10,
      minPlayers: 3,
      timeLimit: 10, // 10 minutes total
    })
  }

  getInitialGameData(): SpyGameData {
    return {
      phase: SpyGamePhase.WAITING,
      currentRound: 1,
      totalRounds: 3,
      location: '',
      locationCategory: '',
      spyPlayerId: '',
      playerRoles: {},
      votes: {},
      questionHistory: [],
      scores: {},
      phaseStartTime: Date.now(),
      questionTimeLimit: 300, // 5 minutes
      votingTimeLimit: 60, // 60 seconds
      currentQuestionerId: null,
      currentTargetId: null,
      pendingQuestion: null,
      playersReady: [],
      allLocationNames: [],
      spyGuessedLocation: undefined,
    }
  }

  initializeRound(locations: { name: string; category: string; roles: string[] }[]): void {
    const data = this.state.data as SpyGameData

    if (!locations || locations.length === 0) {
      throw new Error('No locations available for Spy game')
    }

    // Starting a new round from results should advance round counter first.
    if (data.phase === SpyGamePhase.RESULTS) {
      if (data.currentRound >= data.totalRounds) {
        const winner = this.checkWinCondition()
        if (winner) {
          this.state.status = 'finished'
          this.state.winner = winner.id
        }
        this.state.updatedAt = new Date()
        return
      }
      data.currentRound += 1
    }

    data.allLocationNames = locations.map((l) => l.name).sort()
    const randomLocation = locations[Math.floor(Math.random() * locations.length)]
    data.location = randomLocation.name
    data.locationCategory = randomLocation.category

    // Assign spy role randomly — among the players still here: a departed seat
    // stays in the roster (#1263), and a spy who has left cannot be caught.
    const seatedPlayers = this.getActivePlayers()
    const playerIds = seatedPlayers.map((p) => p.id)
    const spyIndex = Math.floor(Math.random() * playerIds.length)
    data.spyPlayerId = playerIds[spyIndex]

    // Assign roles to non-spy players
    const availableRoles = [...randomLocation.roles]
    data.playerRoles = {}

    for (const player of seatedPlayers) {
      if (player.id === data.spyPlayerId) {
        data.playerRoles[player.id] = 'Spy'
      } else {
        const roleIndex = Math.floor(Math.random() * availableRoles.length)
        data.playerRoles[player.id] = availableRoles[roleIndex]
        // Remove used role to avoid duplicates
        availableRoles.splice(roleIndex, 1)
      }
    }

    // Initialize/preserve scores across rounds.
    for (const player of this.state.players) {
      if (typeof data.scores[player.id] !== 'number') {
        data.scores[player.id] = 0
      }
    }

    // Clear previous round data
    data.votes = {}
    data.questionHistory = []
    data.playersReady = []
    data.currentQuestionerId = null
    data.currentTargetId = null
    data.pendingQuestion = null
    data.spyGuessedLocation = undefined

    // Start role reveal phase
    data.phase = SpyGamePhase.ROLE_REVEAL
    data.phaseStartTime = Date.now()

    this.state.updatedAt = new Date()
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as SpyGameData
    const player = this.state.players.find((p) => p.id === move.playerId)

    // A player who has left takes no further part (#1263).
    if (!player || player.isActive === false) return false

    switch (move.type) {
      case 'player-ready':
        return data.phase === SpyGamePhase.ROLE_REVEAL

      case 'ask-question':
        return (
          data.phase === SpyGamePhase.QUESTIONING &&
          data.currentQuestionerId === move.playerId &&
          typeof move.data.targetId === 'string' &&
          typeof move.data.question === 'string' &&
          move.data.question.trim().length > 0 &&
          move.data.targetId !== move.playerId && // Can't ask yourself
          this.isActivePlayer(move.data.targetId) // Nor someone who has left (#1263)
        )

      case 'answer-question':
        return (
          data.phase === SpyGamePhase.QUESTIONING &&
          data.currentTargetId === move.playerId &&
          typeof move.data.answer === 'string' &&
          move.data.answer.trim().length > 0
        )

      case 'skip-turn':
        return (
          data.phase === SpyGamePhase.QUESTIONING &&
          data.currentQuestionerId === move.playerId
        )

      case 'start-voting':
        return data.phase === SpyGamePhase.QUESTIONING

      case 'vote':
        return (
          data.phase === SpyGamePhase.VOTING &&
          typeof move.data.targetId === 'string' &&
          move.data.targetId !== move.playerId && // Can't vote for yourself
          this.isActivePlayer(move.data.targetId)
        )

      case 'spy-guess-location':
        return (
          data.phase === SpyGamePhase.QUESTIONING &&
          move.playerId === data.spyPlayerId &&
          typeof move.data.location === 'string' &&
          (data.allLocationNames ?? []).includes(move.data.location as string)
        )

      default:
        return false
    }
  }

  processMove(move: Move): void {
    const data = this.state.data as SpyGameData

    switch (move.type) {
      case 'player-ready':
        this.processPlayerReady(move.playerId)
        break

      case 'ask-question':
        this.processAskQuestion(
          move.playerId,
          move.data.targetId as string,
          move.data.question as string
        )
        break

      case 'answer-question':
        this.processAnswerQuestion(move.playerId, move.data.answer as string)
        break

      case 'skip-turn':
        this.processSkipTurn(move.playerId)
        break

      case 'start-voting':
        this.startVotingPhase()
        break

      case 'vote':
        this.processVote(move.playerId, move.data.targetId as string)
        break

      case 'spy-guess-location':
        this.processSpyGuessLocation(move.playerId, move.data.location as string)
        break
    }

    this.state.updatedAt = new Date()
  }

  private processPlayerReady(playerId: string): void {
    const data = this.state.data as SpyGameData
    if (!data.playersReady.includes(playerId)) {
      data.playersReady.push(playerId)
    }

    this.startQuestioningIfAllReady()
  }

  // Only wait for active (connected) players — disconnected players are skipped
  private startQuestioningIfAllReady(): void {
    const data = this.state.data as SpyGameData
    const activePlayers = this.getActivePlayers()
    const readyActive = data.playersReady.filter((id) => this.isActivePlayer(id))
    if (activePlayers.length > 0 && readyActive.length >= activePlayers.length) {
      this.startQuestioningPhase()
    }
  }

  private getActivePlayers(): Player[] {
    return this.state.players.filter((p) => p.isActive !== false)
  }

  private isActivePlayer(playerId: unknown): boolean {
    return this.state.players.some((p) => p.id === playerId && p.isActive !== false)
  }

  private startQuestioningPhase(): void {
    const data = this.state.data as SpyGameData
    data.phase = SpyGamePhase.QUESTIONING
    data.phaseStartTime = Date.now()

    // First player still here asks the first question
    data.currentQuestionerId = this.getActivePlayers()[0]?.id || null
    data.currentTargetId = null
  }

  private processAskQuestion(askerId: string, targetId: string, question: string): void {
    const data = this.state.data as SpyGameData

    // Store question temporarily until answered
    const asker = this.state.players.find((p) => p.id === askerId)
    const target = this.state.players.find((p) => p.id === targetId)

    if (!asker || !target) return

    data.currentTargetId = targetId
    data.pendingQuestion = question
  }

  private processAnswerQuestion(answerId: string, answer: string): void {
    const data = this.state.data as SpyGameData

    if (data.currentQuestionerId && data.currentTargetId && data.pendingQuestion) {
      const asker = this.state.players.find((p) => p.id === data.currentQuestionerId)
      const target = this.state.players.find((p) => p.id === data.currentTargetId)

      if (asker && target) {
        // Add to history
        data.questionHistory.push({
          askerId: data.currentQuestionerId,
          askerName: asker.name,
          targetId: data.currentTargetId,
          targetName: target.name,
          question: data.pendingQuestion,
          answer: answer,
          timestamp: Date.now(),
        })

        // Clear pending question
        data.pendingQuestion = null
      }
    }

    // Move to next questioner
    this.moveToNextQuestioner()
  }

  private processSkipTurn(playerId: string): void {
    this.moveToNextQuestioner()
  }

  private moveToNextQuestioner(): void {
    const data = this.state.data as SpyGameData

    // Find current questioner index, then the next seat still occupied — a
    // player who left keeps their seat in the roster but never asks (#1263).
    const players = this.state.players
    const currentIndex = players.findIndex((p) => p.id === data.currentQuestionerId)
    let nextId: string | null = null
    for (let step = 1; step <= players.length; step += 1) {
      const candidate = players[(currentIndex + step + players.length) % players.length]
      if (candidate && candidate.isActive !== false) {
        nextId = candidate.id
        break
      }
    }

    data.currentQuestionerId = nextId
    data.currentTargetId = null
    data.pendingQuestion = null

    // Check if time limit exceeded or enough questions asked
    const timeElapsed = (Date.now() - data.phaseStartTime) / 1000
    const enoughQuestions = data.questionHistory.length >= this.getActivePlayers().length * 2

    if (timeElapsed >= data.questionTimeLimit || enoughQuestions) {
      this.startVotingPhase()
    }
  }

  private startVotingPhase(): void {
    const data = this.state.data as SpyGameData
    data.phase = SpyGamePhase.VOTING
    data.phaseStartTime = Date.now()
    data.votes = {}
  }

  private processVote(voterId: string, targetId: string): void {
    const data = this.state.data as SpyGameData
    data.votes[voterId] = targetId
    this.closeVoteIfEveryoneVoted()
  }

  // Only count active (connected) players — a player who left does not hold
  // the vote open (#1263).
  private closeVoteIfEveryoneVoted(): boolean {
    const data = this.state.data as SpyGameData
    const activePlayers = this.getActivePlayers()
    const activeVotes = Object.keys(data.votes).filter((voterId) => this.isActivePlayer(voterId))
    if (activeVotes.length >= activePlayers.length) {
      this.calculateResults()
      return true
    }
    return false
  }

  /**
   * #1263: the vote closes on its clock, not only once everyone has voted. The
   * lobby GET calls this, the way it applies the other party games' timeouts,
   * and a missing vote counts as no vote. Returns whether the state changed.
   */
  applyVotingTimeout(nowMs: number = Date.now()): boolean {
    const data = this.state.data as SpyGameData
    if (this.state.status !== 'playing' || data?.phase !== SpyGamePhase.VOTING) return false
    const limitSeconds = Number(data.votingTimeLimit)
    const startedAt = Number(data.phaseStartTime)
    if (!Number.isFinite(limitSeconds) || limitSeconds <= 0 || !Number.isFinite(startedAt)) return false
    if (nowMs - startedAt < limitSeconds * 1000) return false

    this.calculateResults()
    this.state.lastMoveAt = nowMs
    return true
  }

  /**
   * #1277: the role reveal closes on its clock too, not only once everyone
   * still here is ready. Applied by the lobby GET next to the vote's clock.
   * Returns whether the state changed.
   */
  applyRoleRevealTimeout(nowMs: number = Date.now()): boolean {
    const data = this.state.data as SpyGameData
    if (this.state.status !== 'playing' || data?.phase !== SpyGamePhase.ROLE_REVEAL) return false
    const startedAt = Number(data.phaseStartTime)
    if (!Number.isFinite(startedAt)) return false
    if (nowMs - startedAt < SPY_ROLE_REVEAL_TIME_LIMIT_SECONDS * 1000) return false

    this.startQuestioningPhase()
    data.phaseStartTime = nowMs
    this.state.lastMoveAt = nowMs
    this.state.updatedAt = new Date()
    return true
  }

  /**
   * A player left mid-game (#1263). The spy leaving abandons the game before
   * this runs (catalog `abandonWhenRoleLeaves`), and so does the roster
   * falling under three; what is left here is a non-spy leaving a game that
   * carries on. Their seat stays in the roster, marked inactive, so the round's
   * history still names them, but they no longer hold a phase open: not the
   * reveal, not the vote, and they are never asked or made to ask.
   */
  handlePlayerLeave(playerId: string): boolean {
    const data = this.state.data as SpyGameData
    const player = this.state.players.find((p) => p.id === playerId)
    if (!player || player.isActive === false) return false

    player.isActive = false
    // A vote they cast no longer counts; votes cast for them still do.
    if (data?.votes && playerId in data.votes) delete data.votes[playerId]

    if (this.state.status === 'playing' && data) {
      if (data.phase === SpyGamePhase.ROLE_REVEAL) {
        this.startQuestioningIfAllReady()
      } else if (data.phase === SpyGamePhase.QUESTIONING) {
        if (data.currentQuestionerId === playerId) {
          this.moveToNextQuestioner()
        } else if (data.currentTargetId === playerId) {
          // The question they were asked goes unanswered; the asker picks again.
          data.currentTargetId = null
          data.pendingQuestion = null
        }
      } else if (data.phase === SpyGamePhase.VOTING) {
        this.closeVoteIfEveryoneVoted()
      }
    }

    this.state.updatedAt = new Date()
    return true
  }

  private processSpyGuessLocation(playerId: string, guessedLocation: string): void {
    const data = this.state.data as SpyGameData
    data.spyGuessedLocation = guessedLocation

    const isCorrect = guessedLocation === data.location

    if (isCorrect) {
      // Spy correctly guessed — big bonus for the risk
      data.scores[data.spyPlayerId] = (data.scores[data.spyPlayerId] || 0) + 500
    } else {
      // Wrong guess — regular players win
      for (const player of this.getActivePlayers()) {
        if (player.id !== data.spyPlayerId) {
          data.scores[player.id] = (data.scores[player.id] || 0) + 100
        }
      }
    }

    data.phase = SpyGamePhase.RESULTS
    this.finishGameIfFinalRound()
  }

  private calculateResults(): void {
    const data = this.state.data as SpyGameData

    // Count votes
    const voteCounts: Record<string, number> = {}
    for (const targetId of Object.values(data.votes)) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
    }

    // Find player with most votes.
    // Tie on max votes means no elimination: spy escapes by default.
    let maxVotes = 0
    const leaders: string[] = []
    for (const [playerId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count
        leaders.length = 0
        leaders.push(playerId)
      } else if (count === maxVotes && count > 0) {
        leaders.push(playerId)
      }
    }
    const eliminatedId = leaders.length === 1 ? leaders[0] : ''

    // Calculate scores
    const spyWon = eliminatedId !== data.spyPlayerId

    if (spyWon) {
      // Spy wins - gets 300 points
      data.scores[data.spyPlayerId] = (data.scores[data.spyPlayerId] || 0) + 300
    } else {
      // Regular players win - each gets 100 points
      for (const player of this.getActivePlayers()) {
        if (player.id !== data.spyPlayerId) {
          data.scores[player.id] = (data.scores[player.id] || 0) + 100
        }
      }
    }

    // Bonus points for correct votes
    for (const [voterId, targetId] of Object.entries(data.votes)) {
      if (targetId === data.spyPlayerId) {
        data.scores[voterId] = (data.scores[voterId] || 0) + 50
      } else {
        data.scores[voterId] = (data.scores[voterId] || 0) - 10
      }
    }

    data.phase = SpyGamePhase.RESULTS
    this.finishGameIfFinalRound()
    this.state.updatedAt = new Date()
  }

  // The final round's results conclude the game even without a single winner.
  // The base makeMove() already finishes when checkWinCondition() returns a
  // player, but on a tied top score it returns null — and with the client
  // hiding "Next Round" on the last round and spy-init rejecting init once all
  // rounds are done, a tied final round left the game in 'playing' forever.
  // Finish it as a draw instead (#729).
  private finishGameIfFinalRound(): void {
    const data = this.state.data as SpyGameData
    if (data.currentRound >= data.totalRounds) {
      const winner = this.checkWinCondition()
      this.state.status = 'finished'
      // Tie on total score → no single winner: finished as a draw.
      this.state.winner = winner?.id
    }
  }

  checkWinCondition(): Player | null {
    const data = this.state.data as SpyGameData

    // Game ends after all rounds are completed
    if (data.currentRound >= data.totalRounds && data.phase === SpyGamePhase.RESULTS) {
      let maxScore = -Infinity
      let winnerId = ''
      let tie = false

      for (const [playerId, score] of Object.entries(data.scores)) {
        if (score > maxScore) {
          maxScore = score
          winnerId = playerId
          tie = false
        } else if (score === maxScore) {
          tie = true
        }
      }

      if (tie) return null
      return this.state.players.find((p) => p.id === winnerId) || null
    }

    return null
  }

  getGameRules(): string[] {
    return [
      '3-10 players compete to find the spy',
      'One player is randomly assigned as the spy',
      'Regular players see a location, spy does not',
      'Players ask each other questions about the location',
      'Spy must blend in without knowing the location',
      'After questions, all players vote for who they think is the spy',
      'If spy is caught, regular players win. If innocent caught, spy wins',
      'Game consists of multiple rounds with new locations',
    ]
  }

  // Override shouldAdvanceTurn - turn advancement is handled manually in Spy game
  protected shouldAdvanceTurn(_move: Move): boolean {
    return false
  }

  // Get role info for a specific player (what they should see)
  getRoleInfoForPlayer(playerId: string): {
    role: string
    location?: string
    locationRole?: string
    possibleCategories?: string[]
    possibleLocations?: string[]
  } {
    const data = this.state.data as SpyGameData

    if (playerId === data.spyPlayerId) {
      return {
        role: 'Spy',
        possibleCategories: ['Travel', 'Entertainment', 'Public', 'Workplace', 'Recreation', 'Shopping', 'Culture'],
        possibleLocations: data.allLocationNames ?? [],
      }
    } else {
      // Regular player sees location and their specific role
      return {
        role: 'Regular Player',
        location: data.location,
        locationRole: data.playerRoles[playerId],
      }
    }
  }

  // Get current phase info
  getPhaseInfo(): {
    phase: SpyGamePhase
    timeRemaining: number
    currentQuestionerId: string | null
    currentTargetId: string | null
  } {
    const data = this.state.data as SpyGameData
    const timeElapsed = (Date.now() - data.phaseStartTime) / 1000

    let timeLimit = 0
    if (data.phase === SpyGamePhase.QUESTIONING) {
      timeLimit = data.questionTimeLimit
    } else if (data.phase === SpyGamePhase.VOTING) {
      timeLimit = data.votingTimeLimit
    }

    return {
      phase: data.phase,
      timeRemaining: Math.max(0, timeLimit - timeElapsed),
      currentQuestionerId: data.currentQuestionerId,
      currentTargetId: data.currentTargetId,
    }
  }

  // Load state from database
  loadState(state: GameState): void {
    this.restoreState(state)
  }
}

/**
 * Strip spyPlayerId and playerRoles from a state object before broadcasting to all clients.
 * These fields are only safe to expose once the round reaches the RESULTS phase.
 */
export function sanitizeSpyStateForBroadcast<T extends { data?: unknown; status?: string }>(state: T): T {
  const data = state.data as SpyGameData | undefined
  if (!data) return state

  const isRevealed = data.phase === SpyGamePhase.RESULTS || state.status === 'finished'
  if (isRevealed) return state

  // The location goes too: the whole game is the spy not knowing it, and the
  // payload is readable in the browser's network tab. Every player who is
  // entitled to it already gets it from GET /api/game/[gameId]/spy-role, and
  // the results screen reads it from the revealed state above. Its category goes
  // with it (#1262): with 24 places in 7 categories it names the place outright
  // for a one-place category and narrows the rest to a handful.
  const { spyPlayerId: _s, playerRoles: _r, location: _l, locationCategory: _c, ...safeData } = data
  return { ...state, data: safeData }
}
