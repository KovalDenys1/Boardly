import { GameConfig, GameEngine, Move, Player } from '../game-engine'

export type FakeArtistPhase = 'drawing' | 'discussion' | 'voting' | 'reveal'

export interface FakeArtistStroke {
  round: number
  turnIndex: number
  cycle: number
  playerId: string
  content: string
  submittedAt: number
  autoSubmitted?: boolean
}

export interface FakeArtistVote {
  round: number
  playerId: string
  suspectPlayerId: string
  submittedAt: number
  autoSubmitted?: boolean
}

export interface FakeArtistScoreBreakdown {
  correctVotes: number
  successfulFakes: number
  caughtAsFake: number
  autoSubmissions: number
  finalScore: number
}

export interface FakeArtistRoundResult {
  round: number
  fakeArtistId: string
  promptFingerprint: string
  mostVotedPlayerId: string | null
  voteCounts: Record<string, number>
  fakeCaught: boolean
  autoSubmittedStrokes: number
  autoSubmittedVotes: number
  playerScoreDeltas: Record<string, number>
  resolvedAt: number
}

export interface FakeArtistGameData {
  phase: FakeArtistPhase
  currentRound: number
  totalRounds: number
  strokesPerPlayer: number
  playerOrder: string[]
  fakeArtistId: string
  promptFingerprint: string
  currentTurnIndex: number
  totalTurnCount: number
  strokes: FakeArtistStroke[]
  votes: FakeArtistVote[]
  submittedPlayerIds: string[]
  scores: Record<string, number>
  scoreBreakdown: Record<string, FakeArtistScoreBreakdown>
  roundResults: FakeArtistRoundResult[]
  winnerId: string | null
  ranking: string[]
  completionReason: 'all-rounds-finished' | null
  finishedAt: number | null
  isMvpScaffold: boolean
}

export interface FakeArtistTimeoutResolution {
  changed: boolean
  timeoutWindowsConsumed: number
  phaseTransitions: number
  revealAdvances: number
  autoSubmittedStrokes: number
  autoSubmittedVotes: number
  autoSubmittedPlayerIds: string[]
}

const DEFAULT_TOTAL_ROUNDS = 3
const MIN_TOTAL_ROUNDS = 1
const MAX_TOTAL_ROUNDS = 10
const DEFAULT_STROKES_PER_PLAYER = 2
const MIN_STROKES_PER_PLAYER = 1
const MAX_STROKES_PER_PLAYER = 4

const MIN_STROKE_CONTENT_LENGTH = 3
const MAX_STROKE_CONTENT_LENGTH = 120_000
const FAKE_ARTIST_TIMEOUT_FALLBACK_MAX_ITERATIONS = 256

const SCORE_CORRECT_VOTE = 12
const SCORE_WRONG_VOTE_PENALTY = -2
const SCORE_FAKE_ESCAPED_BONUS = 20
const SCORE_AUTO_SUBMISSION_PENALTY = 4

const PROMPT_FINGERPRINT_POOL = [
  'prompt:animal',
  'prompt:vehicle',
  'prompt:food',
  'prompt:landmark',
  'prompt:instrument',
  'prompt:profession',
  'prompt:sport',
  'prompt:weather',
  'prompt:movie',
  'prompt:holiday',
  'prompt:object',
  'prompt:city',
  'prompt:fantasy',
  'prompt:space',
  'prompt:history',
]

export class FakeArtistGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 10, minPlayers: 4 }) {
    super(gameId, 'fake_artist', config)
  }

  getInitialGameData(): FakeArtistGameData {
    return {
      phase: 'drawing',
      currentRound: 1,
      totalRounds: this.resolveTotalRounds(),
      strokesPerPlayer: this.resolveStrokesPerPlayer(),
      playerOrder: [],
      fakeArtistId: '',
      promptFingerprint: '',
      currentTurnIndex: 0,
      totalTurnCount: 0,
      strokes: [],
      votes: [],
      submittedPlayerIds: [],
      scores: {},
      scoreBreakdown: {},
      roundResults: [],
      winnerId: null,
      ranking: [],
      completionReason: null,
      finishedAt: null,
      isMvpScaffold: true,
    }
  }

  startGame(): boolean {
    const started = super.startGame()
    if (!started) {
      return false
    }

    const data = this.state.data as FakeArtistGameData
    data.totalRounds = this.resolveTotalRounds()
    data.strokesPerPlayer = this.resolveStrokesPerPlayer()
    data.playerOrder = this.state.players.map((player) => player.id)
    data.currentRound = 1
    data.currentTurnIndex = 0
    data.totalTurnCount = data.playerOrder.length * data.strokesPerPlayer
    data.phase = 'drawing'
    data.strokes = []
    data.votes = []
    data.submittedPlayerIds = []
    data.fakeArtistId = this.resolveFakeArtistId(data.currentRound, data.playerOrder)
    data.promptFingerprint = this.resolvePromptFingerprint(data.currentRound, data.fakeArtistId, data.playerOrder)
    data.scores = {}
    data.scoreBreakdown = {}
    data.roundResults = []
    data.winnerId = null
    data.ranking = []
    data.completionReason = null
    data.finishedAt = null

    for (const player of this.state.players) {
      data.scores[player.id] = 0
      data.scoreBreakdown[player.id] = {
        correctVotes: 0,
        successfulFakes: 0,
        caughtAsFake: 0,
        autoSubmissions: 0,
        finalScore: 0,
      }
      player.score = 0
      player.isActive = true
    }

    this.recomputeRanking(data)
    return true
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as FakeArtistGameData
    if (this.state.status !== 'playing') {
      return false
    }

    if (!this.isKnownPlayer(move.playerId, data)) {
      return false
    }

    if (data.phase === 'drawing') {
      if (move.type !== 'submit-stroke') {
        return false
      }

      const expectedPlayerId = this.getCurrentTurnPlayerId(data)
      if (!expectedPlayerId || move.playerId !== expectedPlayerId) {
        return false
      }

      const alreadySubmittedCurrentTurn = data.strokes.some(
        (stroke) => stroke.round === data.currentRound && stroke.turnIndex === data.currentTurnIndex
      )
      if (alreadySubmittedCurrentTurn) {
        return false
      }

      const content = this.getStringField(move.data, 'content')
      if (!content) {
        return false
      }
      const normalizedLength = content.trim().length
      return normalizedLength >= MIN_STROKE_CONTENT_LENGTH && normalizedLength <= MAX_STROKE_CONTENT_LENGTH
    }

    if (data.phase === 'discussion') {
      return move.type === 'advance-phase'
    }

    if (data.phase === 'voting') {
      if (move.type !== 'submit-vote') {
        return false
      }

      if (data.submittedPlayerIds.includes(move.playerId)) {
        return false
      }

      const suspectPlayerId = this.getStringField(move.data, 'suspectPlayerId')
      if (!suspectPlayerId) {
        return false
      }

      if (!this.isKnownPlayer(suspectPlayerId, data)) {
        return false
      }

      return suspectPlayerId !== move.playerId
    }

    if (data.phase === 'reveal') {
      return move.type === 'advance-round'
    }

    return false
  }

  processMove(move: Move): void {
    const data = this.state.data as FakeArtistGameData
    const nowMs = Date.now()

    if (data.phase === 'drawing' && move.type === 'submit-stroke') {
      const content = this.getStringField(move.data, 'content')
      if (!content) {
        return
      }

      this.submitStroke(data, move.playerId, content.trim(), nowMs, false)
      return
    }

    if (data.phase === 'discussion' && move.type === 'advance-phase') {
      data.phase = 'voting'
      data.votes = []
      data.submittedPlayerIds = []
      this.state.lastMoveAt = nowMs
      return
    }

    if (data.phase === 'voting' && move.type === 'submit-vote') {
      const suspectPlayerId = this.getStringField(move.data, 'suspectPlayerId')
      if (!suspectPlayerId) {
        return
      }

      data.votes.push({
        round: data.currentRound,
        playerId: move.playerId,
        suspectPlayerId,
        submittedAt: nowMs,
      })
      data.submittedPlayerIds.push(move.playerId)

      if (data.submittedPlayerIds.length >= data.playerOrder.length) {
        data.phase = 'reveal'
        data.submittedPlayerIds = []
        this.state.lastMoveAt = nowMs
      }
      return
    }

    if (data.phase === 'reveal' && move.type === 'advance-round') {
      this.advanceAfterReveal(data, nowMs)
    }
  }

  checkWinCondition(): Player | null {
    if (this.state.status !== 'finished') {
      return null
    }

    const data = this.state.data as FakeArtistGameData
    if (!data.winnerId) {
      return null
    }

    return this.state.players.find((player) => player.id === data.winnerId) || null
  }

  getGameRules(): string[] {
    return [
      'Each round assigns one fake artist role and one hidden prompt fingerprint.',
      'Players submit one stroke per turn in deterministic order.',
      'After drawing, host can advance to voting, where every player submits one suspect vote.',
      'If the fake artist is not the most-voted suspect, they gain escape bonus points.',
      'Timeout fallback auto-submits stalled turns and votes, then auto-advances phases.',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return false
  }

  getCurrentTurnPlayerId(data: FakeArtistGameData = this.state.data as FakeArtistGameData): string | null {
    if (this.state.status !== 'playing' || data.phase !== 'drawing' || data.playerOrder.length === 0) {
      return null
    }

    if (data.currentTurnIndex >= data.totalTurnCount) {
      return null
    }

    const playerIndex = data.currentTurnIndex % data.playerOrder.length
    return data.playerOrder[playerIndex] || null
  }

  getPendingVotePlayerIds(data: FakeArtistGameData = this.state.data as FakeArtistGameData): string[] {
    if (this.state.status !== 'playing' || data.phase !== 'voting') {
      return []
    }
    const submittedSet = new Set(data.submittedPlayerIds)
    return data.playerOrder.filter((playerId) => !submittedSet.has(playerId))
  }

  applyTimeoutFallback(turnTimerSeconds: number, nowMs: number = Date.now()): FakeArtistTimeoutResolution {
    const result: FakeArtistTimeoutResolution = {
      changed: false,
      timeoutWindowsConsumed: 0,
      phaseTransitions: 0,
      revealAdvances: 0,
      autoSubmittedStrokes: 0,
      autoSubmittedVotes: 0,
      autoSubmittedPlayerIds: [],
    }

    if (this.state.status !== 'playing') {
      return result
    }

    if (typeof turnTimerSeconds !== 'number' || !Number.isFinite(turnTimerSeconds) || turnTimerSeconds <= 0) {
      return result
    }

    const timeoutMs = Math.max(1, Math.floor(turnTimerSeconds * 1000))
    let phaseStartedAt =
      typeof this.state.lastMoveAt === 'number' && Number.isFinite(this.state.lastMoveAt)
        ? this.state.lastMoveAt
        : nowMs

    if (phaseStartedAt > nowMs) {
      phaseStartedAt = nowMs
    }

    let safetyCounter = 0
    while (
      this.state.status === 'playing' &&
      nowMs - phaseStartedAt >= timeoutMs &&
      safetyCounter < FAKE_ARTIST_TIMEOUT_FALLBACK_MAX_ITERATIONS
    ) {
      safetyCounter += 1
      const timeoutAt = phaseStartedAt + timeoutMs
      const data = this.state.data as FakeArtistGameData
      const previousPhase = data.phase

      if (data.phase === 'drawing') {
        const currentTurnPlayerId = this.getCurrentTurnPlayerId(data)
        if (!currentTurnPlayerId) {
          data.phase = 'discussion'
          this.state.lastMoveAt = timeoutAt
          result.changed = true
          result.timeoutWindowsConsumed += 1
          result.phaseTransitions += 1
          phaseStartedAt = timeoutAt
          continue
        }

        this.submitStroke(
          data,
          currentTurnPlayerId,
          this.buildTimeoutFallbackStroke(currentTurnPlayerId, data.currentRound, data.currentTurnIndex),
          timeoutAt,
          true
        )
        result.changed = true
        result.autoSubmittedStrokes += 1
        if (!result.autoSubmittedPlayerIds.includes(currentTurnPlayerId)) {
          result.autoSubmittedPlayerIds.push(currentTurnPlayerId)
        }
      } else if (data.phase === 'discussion') {
        data.phase = 'voting'
        data.votes = []
        data.submittedPlayerIds = []
        this.state.lastMoveAt = timeoutAt
        result.changed = true
      } else if (data.phase === 'voting') {
        const pendingPlayers = this.getPendingVotePlayerIds(data)
        for (const voterId of pendingPlayers) {
          const suspectPlayerId = this.resolveDefaultVoteTarget(voterId, data.playerOrder)
          data.votes.push({
            round: data.currentRound,
            playerId: voterId,
            suspectPlayerId,
            submittedAt: timeoutAt,
            autoSubmitted: true,
          })
          data.submittedPlayerIds.push(voterId)
          result.autoSubmittedVotes += 1
          if (!result.autoSubmittedPlayerIds.includes(voterId)) {
            result.autoSubmittedPlayerIds.push(voterId)
          }
        }

        if (data.submittedPlayerIds.length >= data.playerOrder.length) {
          data.phase = 'reveal'
          data.submittedPlayerIds = []
          this.state.lastMoveAt = timeoutAt
          result.changed = true
        } else {
          break
        }
      } else if (data.phase === 'reveal') {
        this.advanceAfterReveal(data, timeoutAt)
        this.state.lastMoveAt = timeoutAt
        result.changed = true
        result.revealAdvances += 1
      } else {
        break
      }

      if (previousPhase !== data.phase) {
        result.phaseTransitions += 1
      }
      result.timeoutWindowsConsumed += 1
      phaseStartedAt = timeoutAt
    }

    return result
  }

  private submitStroke(
    data: FakeArtistGameData,
    playerId: string,
    content: string,
    submittedAt: number,
    autoSubmitted: boolean,
  ): void {
    if (data.currentTurnIndex >= data.totalTurnCount) {
      return
    }

    data.strokes.push({
      round: data.currentRound,
      turnIndex: data.currentTurnIndex,
      cycle: Math.floor(data.currentTurnIndex / Math.max(1, data.playerOrder.length)) + 1,
      playerId,
      content,
      submittedAt,
      ...(autoSubmitted ? { autoSubmitted: true } : {}),
    })
    data.currentTurnIndex += 1
    this.state.lastMoveAt = submittedAt

    if (data.currentTurnIndex >= data.totalTurnCount) {
      data.phase = 'discussion'
    }
  }

  private advanceAfterReveal(data: FakeArtistGameData, nowMs: number): void {
    this.scoreCurrentRound(data, nowMs)

    if (data.currentRound >= data.totalRounds) {
      this.finalizeGame(data, nowMs)
      return
    }

    data.currentRound += 1
    data.phase = 'drawing'
    data.currentTurnIndex = 0
    data.totalTurnCount = data.playerOrder.length * data.strokesPerPlayer
    data.strokes = []
    data.votes = []
    data.submittedPlayerIds = []
    data.fakeArtistId = this.resolveFakeArtistId(data.currentRound, data.playerOrder)
    data.promptFingerprint = this.resolvePromptFingerprint(data.currentRound, data.fakeArtistId, data.playerOrder)
    this.state.lastMoveAt = nowMs
  }

  private scoreCurrentRound(data: FakeArtistGameData, nowMs: number): void {
    const voteCounts: Record<string, number> = {}
    for (const playerId of data.playerOrder) {
      voteCounts[playerId] = 0
    }

    for (const vote of data.votes) {
      voteCounts[vote.suspectPlayerId] = (voteCounts[vote.suspectPlayerId] || 0) + 1
    }

    const mostVotedPlayerId = this.resolveMostVotedPlayer(voteCounts, data.playerOrder)
    const fakeCaught = !!mostVotedPlayerId && mostVotedPlayerId === data.fakeArtistId
    const playerScoreDeltas: Record<string, number> = {}
    for (const playerId of data.playerOrder) {
      playerScoreDeltas[playerId] = 0
    }

    if (!fakeCaught) {
      playerScoreDeltas[data.fakeArtistId] += SCORE_FAKE_ESCAPED_BONUS
      const fakeBreakdown = data.scoreBreakdown[data.fakeArtistId]
      if (fakeBreakdown) {
        fakeBreakdown.successfulFakes += 1
      }
    } else {
      const fakeBreakdown = data.scoreBreakdown[data.fakeArtistId]
      if (fakeBreakdown) {
        fakeBreakdown.caughtAsFake += 1
      }
    }

    for (const vote of data.votes) {
      if (vote.suspectPlayerId === data.fakeArtistId && fakeCaught) {
        playerScoreDeltas[vote.playerId] += SCORE_CORRECT_VOTE
        const voterBreakdown = data.scoreBreakdown[vote.playerId]
        if (voterBreakdown) {
          voterBreakdown.correctVotes += 1
        }
      } else {
        playerScoreDeltas[vote.playerId] += SCORE_WRONG_VOTE_PENALTY
      }
    }

    let autoSubmittedStrokes = 0
    let autoSubmittedVotes = 0

    for (const stroke of data.strokes) {
      if (!stroke.autoSubmitted) continue
      autoSubmittedStrokes += 1
      playerScoreDeltas[stroke.playerId] -= SCORE_AUTO_SUBMISSION_PENALTY
      const strokeBreakdown = data.scoreBreakdown[stroke.playerId]
      if (strokeBreakdown) {
        strokeBreakdown.autoSubmissions += 1
      }
    }

    for (const vote of data.votes) {
      if (!vote.autoSubmitted) continue
      autoSubmittedVotes += 1
      playerScoreDeltas[vote.playerId] -= SCORE_AUTO_SUBMISSION_PENALTY
      const voteBreakdown = data.scoreBreakdown[vote.playerId]
      if (voteBreakdown) {
        voteBreakdown.autoSubmissions += 1
      }
    }

    for (const playerId of data.playerOrder) {
      this.applyScoreDelta(data, playerId, playerScoreDeltas[playerId] || 0)
    }

    data.roundResults.push({
      round: data.currentRound,
      fakeArtistId: data.fakeArtistId,
      promptFingerprint: data.promptFingerprint,
      mostVotedPlayerId,
      voteCounts,
      fakeCaught,
      autoSubmittedStrokes,
      autoSubmittedVotes,
      playerScoreDeltas,
      resolvedAt: nowMs,
    })

    this.recomputeRanking(data)
  }

  private applyScoreDelta(data: FakeArtistGameData, playerId: string, delta: number): void {
    const previous = data.scores[playerId] || 0
    const nextScore = Math.max(0, previous + delta)
    data.scores[playerId] = nextScore

    const statePlayer = this.state.players.find((player) => player.id === playerId)
    if (statePlayer) {
      statePlayer.score = nextScore
    }

    const breakdown = data.scoreBreakdown[playerId]
    if (breakdown) {
      breakdown.finalScore = nextScore
    }
  }

  private recomputeRanking(data: FakeArtistGameData): void {
    const playerOrder = new Map<string, number>(
      data.playerOrder.map((playerId, index) => [playerId, index])
    )
    const ranking = [...data.playerOrder].sort((leftId, rightId) => {
      const scoreDelta = (data.scores[rightId] || 0) - (data.scores[leftId] || 0)
      if (scoreDelta !== 0) {
        return scoreDelta
      }

      const correctVoteDelta =
        (data.scoreBreakdown[rightId]?.correctVotes || 0) - (data.scoreBreakdown[leftId]?.correctVotes || 0)
      if (correctVoteDelta !== 0) {
        return correctVoteDelta
      }

      const autoSubmissionDelta =
        (data.scoreBreakdown[leftId]?.autoSubmissions || 0) -
        (data.scoreBreakdown[rightId]?.autoSubmissions || 0)
      if (autoSubmissionDelta !== 0) {
        return autoSubmissionDelta
      }

      return (playerOrder.get(leftId) || 0) - (playerOrder.get(rightId) || 0)
    })

    data.ranking = ranking
    data.winnerId = ranking[0] || null
  }

  private finalizeGame(data: FakeArtistGameData, nowMs: number): void {
    this.recomputeRanking(data)
    data.completionReason = 'all-rounds-finished'
    data.finishedAt = nowMs
    data.winnerId = data.ranking[0] || null
    this.state.status = 'finished'
    this.state.winner = data.winnerId ?? undefined
    this.state.lastMoveAt = nowMs
  }

  private resolveMostVotedPlayer(voteCounts: Record<string, number>, playerOrder: string[]): string | null {
    if (playerOrder.length === 0) {
      return null
    }

    const order = new Map(playerOrder.map((playerId, index) => [playerId, index]))
    return [...playerOrder].sort((leftId, rightId) => {
      const countDelta = (voteCounts[rightId] || 0) - (voteCounts[leftId] || 0)
      if (countDelta !== 0) {
        return countDelta
      }
      return (order.get(leftId) || 0) - (order.get(rightId) || 0)
    })[0] || null
  }

  private resolveFakeArtistId(round: number, playerOrder: string[]): string {
    if (playerOrder.length === 0) {
      return ''
    }
    const index = (round - 1) % playerOrder.length
    return playerOrder[index] || playerOrder[0]
  }

  private resolvePromptFingerprint(round: number, fakeArtistId: string, playerOrder: string[]): string {
    const fakeIndex = Math.max(0, playerOrder.findIndex((playerId) => playerId === fakeArtistId))
    const promptIndex = (round - 1 + fakeIndex) % PROMPT_FINGERPRINT_POOL.length
    return PROMPT_FINGERPRINT_POOL[promptIndex] || PROMPT_FINGERPRINT_POOL[0]
  }

  private resolveDefaultVoteTarget(voterId: string, playerOrder: string[]): string {
    if (playerOrder.length === 0) {
      return voterId
    }

    const voterIndex = playerOrder.findIndex((playerId) => playerId === voterId)
    if (voterIndex === -1) {
      return playerOrder[0]
    }

    const nextIndex = (voterIndex + 1) % playerOrder.length
    const candidate = playerOrder[nextIndex]
    if (candidate && candidate !== voterId) {
      return candidate
    }

    return playerOrder.find((playerId) => playerId !== voterId) || voterId
  }

  private resolveTotalRounds(): number {
    const rawRounds = (this.config.rules as { rounds?: unknown } | undefined)?.rounds
    if (typeof rawRounds === 'number' && Number.isFinite(rawRounds) && rawRounds > 0) {
      return Math.min(MAX_TOTAL_ROUNDS, Math.max(MIN_TOTAL_ROUNDS, Math.floor(rawRounds)))
    }
    return DEFAULT_TOTAL_ROUNDS
  }

  private resolveStrokesPerPlayer(): number {
    const rawValue = (this.config.rules as { strokesPerPlayer?: unknown } | undefined)?.strokesPerPlayer
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
      return Math.min(MAX_STROKES_PER_PLAYER, Math.max(MIN_STROKES_PER_PLAYER, Math.floor(rawValue)))
    }
    return DEFAULT_STROKES_PER_PLAYER
  }

  private isKnownPlayer(playerId: string, data: FakeArtistGameData): boolean {
    return data.playerOrder.includes(playerId)
  }

  private getStringField(data: Record<string, unknown>, key: string): string | null {
    const value = data[key]
    return typeof value === 'string' ? value : null
  }

  private buildTimeoutFallbackStroke(playerId: string, round: number, turnIndex: number): string {
    return `[AUTO TIMEOUT] ${playerId} skipped stroke in round ${round}, turn ${turnIndex + 1}.`
  }
}
