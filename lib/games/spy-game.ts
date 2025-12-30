import { GameEngine, Player, Move, GameState } from '../game-engine'
import { prisma } from '../db'

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
  phaseStartTime: number
  questionTimeLimit: number // seconds
  votingTimeLimit: number // seconds
  currentQuestionerId: string | null
  currentTargetId: string | null
  pendingQuestion: string | null // Temporary storage for current question
  playersReady: Set<string> // For role reveal phase
}

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
      playersReady: new Set(),
    }
  }

  async initializeRound(): Promise<void> {
    const data = this.state.data as SpyGameData

    // Select random location
    const locations = await prisma.spyLocation.findMany({
      where: { isActive: true },
    })

    if (locations.length === 0) {
      throw new Error('No locations available for Spy game')
    }

    const randomLocation = locations[Math.floor(Math.random() * locations.length)]
    data.location = randomLocation.name
    data.locationCategory = randomLocation.category

    // Assign spy role randomly
    const playerIds = this.state.players.map((p) => p.id)
    const spyIndex = Math.floor(Math.random() * playerIds.length)
    data.spyPlayerId = playerIds[spyIndex]

    // Assign roles to non-spy players
    const availableRoles = [...randomLocation.roles]
    data.playerRoles = {}

    for (const player of this.state.players) {
      if (player.id === data.spyPlayerId) {
        data.playerRoles[player.id] = 'Spy'
      } else {
        const roleIndex = Math.floor(Math.random() * availableRoles.length)
        data.playerRoles[player.id] = availableRoles[roleIndex]
        // Remove used role to avoid duplicates
        availableRoles.splice(roleIndex, 1)
      }
    }

    // Initialize scores if first round
    if (data.currentRound === 1) {
      for (const player of this.state.players) {
        data.scores[player.id] = 0
      }
    }

    // Clear previous round data
    data.votes = {}
    data.questionHistory = []
    data.playersReady = new Set()
    data.currentQuestionerId = null
    data.currentTargetId = null
    data.pendingQuestion = null

    // Start role reveal phase
    data.phase = SpyGamePhase.ROLE_REVEAL
    data.phaseStartTime = Date.now()

    this.state.updatedAt = new Date()
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as SpyGameData
    const player = this.state.players.find((p) => p.id === move.playerId)

    if (!player) return false

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
          move.data.targetId !== move.playerId // Can't ask yourself
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

      case 'vote':
        return (
          data.phase === SpyGamePhase.VOTING &&
          typeof move.data.targetId === 'string' &&
          move.data.targetId !== move.playerId && // Can't vote for yourself
          this.state.players.some((p) => p.id === move.data.targetId)
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

      case 'vote':
        this.processVote(move.playerId, move.data.targetId as string)
        break
    }

    this.state.updatedAt = new Date()
  }

  private processPlayerReady(playerId: string): void {
    const data = this.state.data as SpyGameData
    data.playersReady.add(playerId)

    // If all players are ready, start questioning phase
    if (data.playersReady.size === this.state.players.length) {
      this.startQuestioningPhase()
    }
  }

  private startQuestioningPhase(): void {
    const data = this.state.data as SpyGameData
    data.phase = SpyGamePhase.QUESTIONING
    data.phaseStartTime = Date.now()

    // First player asks question
    data.currentQuestionerId = this.state.players[0]?.id || null
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

    // Find current questioner index
    const currentIndex = this.state.players.findIndex((p) => p.id === data.currentQuestionerId)
    const nextIndex = (currentIndex + 1) % this.state.players.length

    data.currentQuestionerId = this.state.players[nextIndex]?.id || null
    data.currentTargetId = null

    // Check if time limit exceeded or enough questions asked
    const timeElapsed = (Date.now() - data.phaseStartTime) / 1000
    const enoughQuestions = data.questionHistory.length >= this.state.players.length * 2

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

    // If all players have voted, calculate results
    if (Object.keys(data.votes).length === this.state.players.length) {
      this.calculateResults()
    }
  }

  private calculateResults(): void {
    const data = this.state.data as SpyGameData

    // Count votes
    const voteCounts: Record<string, number> = {}
    for (const targetId of Object.values(data.votes)) {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1
    }

    // Find player with most votes
    let maxVotes = 0
    let eliminatedId = ''
    for (const [playerId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count
        eliminatedId = playerId
      }
    }

    // Calculate scores
    const spyWon = eliminatedId !== data.spyPlayerId

    if (spyWon) {
      // Spy wins - gets 300 points
      data.scores[data.spyPlayerId] = (data.scores[data.spyPlayerId] || 0) + 300
    } else {
      // Regular players win - each gets 100 points
      for (const player of this.state.players) {
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
    this.state.updatedAt = new Date()
  }

  checkWinCondition(): Player | null {
    const data = this.state.data as SpyGameData

    // Game ends after all rounds are completed
    if (data.currentRound >= data.totalRounds && data.phase === SpyGamePhase.RESULTS) {
      // Find player with highest score
      let maxScore = 0
      let winnerId = ''

      for (const [playerId, score] of Object.entries(data.scores)) {
        if (score > maxScore) {
          maxScore = score
          winnerId = playerId
        }
      }

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
  } {
    const data = this.state.data as SpyGameData

    if (playerId === data.spyPlayerId) {
      // Spy sees list of possible categories
      return {
        role: 'Spy',
        possibleCategories: ['Travel', 'Entertainment', 'Public', 'Workplace', 'Recreation'],
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
