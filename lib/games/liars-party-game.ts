import { GameConfig, GameEngine, Move, Player } from '../game-engine'

export type LiarsPartyPhase = 'claim' | 'challenge' | 'reveal'
export type LiarsPartyChallengeDecision = 'challenge' | 'believe'

export interface LiarsPartyClaim {
  playerId: string
  text: string
  isBluff: boolean
  submittedAt: number
  autoSubmitted?: boolean
}

export interface LiarsPartyChallengeVote {
  playerId: string
  decision: LiarsPartyChallengeDecision
  submittedAt: number
  autoSubmitted?: boolean
}

export interface LiarsPartyRoundResult {
  round: number
  claimantId: string
  claimText: string
  wasBluff: boolean
  challengedBy: string[]
  believedBy: string[]
  bluffCaught: boolean
  fooledPlayers: number
  claimantScoreDelta: number
  voterScoreDeltas: Record<string, number>
  claimantStrikeDelta: number
  resolvedAt: number
}

export interface LiarsPartyGameData {
  phase: LiarsPartyPhase
  currentRound: number
  maxRounds: number
  eliminationThreshold: number
  claimantOrder: string[]
  currentClaimantId: string
  currentClaimantIndex: number
  activePlayerIds: string[]
  eliminatedPlayerIds: string[]
  eliminatedAtRound: Record<string, number | null>
  claim: LiarsPartyClaim | null
  challengeVotes: LiarsPartyChallengeVote[]
  submittedPlayerIds: string[]
  currentRoundResolved: boolean
  roundResults: LiarsPartyRoundResult[]
  scores: Record<string, number>
  strikes: Record<string, number>
  winnerId: string | null
  ranking: string[]
  completionReason: 'last-player-standing' | 'max-rounds-reached' | null
  finishedAt: number | null
  isMvpScaffold: boolean
}

export interface LiarsPartyTimeoutResolution {
  changed: boolean
  timeoutWindowsConsumed: number
  phaseTransitions: number
  revealAdvances: number
  autoSubmittedClaims: number
  autoSubmittedChallenges: number
  autoSubmittedPlayerIds: string[]
}

const DEFAULT_MAX_ROUNDS = 10
const MIN_MAX_ROUNDS = 1
const MAX_MAX_ROUNDS = 25
const DEFAULT_ELIMINATION_THRESHOLD = 2
const MIN_ELIMINATION_THRESHOLD = 1
const MAX_ELIMINATION_THRESHOLD = 5

const MIN_CLAIM_LENGTH = 5
const MAX_CLAIM_LENGTH = 180
const LIARS_PARTY_TIMEOUT_FALLBACK_MAX_ITERATIONS = 256

const SCORE_SUCCESSFUL_BLUFF_BASE = 20
const SCORE_SUCCESSFUL_BLUFF_PER_FOOLED = 6
const SCORE_BLUFF_CAUGHT_PENALTY = -12
const SCORE_TRUTH_BELIEVED_BONUS = 12
const SCORE_TRUTH_CHALLENGED_BONUS = 4

const SCORE_CHALLENGE_CORRECT = 14
const SCORE_CHALLENGE_WRONG = -6
const SCORE_BELIEVE_CORRECT = 10
const SCORE_BELIEVE_WRONG = -8
const SCORE_AUTO_SUBMISSION_PENALTY = 4

export class LiarsPartyGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 12, minPlayers: 4 }) {
    super(gameId, 'liars_party', config)
  }

  getInitialGameData(): LiarsPartyGameData {
    return {
      phase: 'claim',
      currentRound: 1,
      maxRounds: this.resolveMaxRounds(),
      eliminationThreshold: this.resolveEliminationThreshold(),
      claimantOrder: [],
      currentClaimantId: '',
      currentClaimantIndex: 0,
      activePlayerIds: [],
      eliminatedPlayerIds: [],
      eliminatedAtRound: {},
      claim: null,
      challengeVotes: [],
      submittedPlayerIds: [],
      currentRoundResolved: false,
      roundResults: [],
      scores: {},
      strikes: {},
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

    const data = this.state.data as LiarsPartyGameData
    data.maxRounds = this.resolveMaxRounds()
    data.eliminationThreshold = this.resolveEliminationThreshold()
    data.claimantOrder = this.state.players.map((player) => player.id)
    data.currentClaimantIndex = 0
    data.currentClaimantId = data.claimantOrder[0] || ''
    data.activePlayerIds = [...data.claimantOrder]
    data.eliminatedPlayerIds = []
    data.eliminatedAtRound = {}
    data.phase = 'claim'
    data.currentRound = 1
    data.claim = null
    data.challengeVotes = []
    data.submittedPlayerIds = []
    data.currentRoundResolved = false
    data.roundResults = []
    data.scores = {}
    data.strikes = {}
    data.winnerId = null
    data.ranking = []
    data.completionReason = null
    data.finishedAt = null

    for (const player of this.state.players) {
      data.scores[player.id] = 0
      data.strikes[player.id] = 0
      data.eliminatedAtRound[player.id] = null
      player.score = 0
      player.isActive = true
    }

    this.recomputeRanking(data)
    return true
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as LiarsPartyGameData
    if (this.state.status !== 'playing') {
      return false
    }

    if (!this.isKnownPlayer(move.playerId)) {
      return false
    }

    if (data.phase === 'claim') {
      if (move.type !== 'submit-claim') {
        return false
      }
      if (move.playerId !== data.currentClaimantId || !this.isActivePlayer(move.playerId, data)) {
        return false
      }
      if (data.claim) {
        return false
      }

      const claimText = this.getStringField(move.data, 'claim')
      const isBluff = move.data.isBluff
      if (typeof claimText !== 'string' || typeof isBluff !== 'boolean') {
        return false
      }

      const normalizedLength = claimText.trim().length
      return normalizedLength >= MIN_CLAIM_LENGTH && normalizedLength <= MAX_CLAIM_LENGTH
    }

    if (data.phase === 'challenge') {
      if (move.type !== 'submit-challenge') {
        return false
      }
      if (!this.isActivePlayer(move.playerId, data) || move.playerId === data.currentClaimantId) {
        return false
      }
      if (data.submittedPlayerIds.includes(move.playerId)) {
        return false
      }

      const decision = this.getStringField(move.data, 'decision')
      return decision === 'challenge' || decision === 'believe'
    }

    if (data.phase === 'reveal') {
      return move.type === 'advance-round'
    }

    return false
  }

  processMove(move: Move): void {
    const data = this.state.data as LiarsPartyGameData
    const nowMs = Date.now()

    if (data.phase === 'claim' && move.type === 'submit-claim') {
      const claimText = this.getStringField(move.data, 'claim')
      const isBluff = move.data.isBluff
      if (typeof claimText !== 'string' || typeof isBluff !== 'boolean') {
        return
      }

      data.claim = {
        playerId: move.playerId,
        text: claimText.trim(),
        isBluff,
        submittedAt: nowMs,
      }
      data.phase = 'challenge'
      data.submittedPlayerIds = []
      this.state.lastMoveAt = nowMs

      if (this.getCurrentRoundVoterIds(data).length === 0) {
        data.phase = 'reveal'
      }
      return
    }

    if (data.phase === 'challenge' && move.type === 'submit-challenge') {
      const decision = this.getStringField(move.data, 'decision')
      if (decision !== 'challenge' && decision !== 'believe') {
        return
      }

      data.challengeVotes.push({
        playerId: move.playerId,
        decision,
        submittedAt: nowMs,
      })
      data.submittedPlayerIds.push(move.playerId)

      if (data.submittedPlayerIds.length >= this.getCurrentRoundVoterIds(data).length) {
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

    const data = this.state.data as LiarsPartyGameData
    if (!data.winnerId) {
      return null
    }

    return this.state.players.find((player) => player.id === data.winnerId) || null
  }

  getGameRules(): string[] {
    return [
      'Each round, one active player becomes the claimant and submits one claim.',
      'Other active players submit one vote: challenge or believe.',
      'A bluff is considered caught only when challengers are a strict majority.',
      'Wrong votes lose points; correct reads gain points; repeated caught bluffs add strikes.',
      'A player is eliminated after reaching strike limit, and ranking resolves deterministically.',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return false
  }

  getCurrentClaimantId(): string | null {
    const data = this.state.data as LiarsPartyGameData
    if (this.state.status !== 'playing' || !data.currentClaimantId) {
      return null
    }
    return data.currentClaimantId
  }

  getPendingChallengePlayerIds(): string[] {
    const data = this.state.data as LiarsPartyGameData
    if (this.state.status !== 'playing' || data.phase !== 'challenge') {
      return []
    }

    const submittedSet = new Set(data.submittedPlayerIds)
    return this.getCurrentRoundVoterIds(data).filter((playerId) => !submittedSet.has(playerId))
  }

  applyTimeoutFallback(turnTimerSeconds: number, nowMs: number = Date.now()): LiarsPartyTimeoutResolution {
    const result: LiarsPartyTimeoutResolution = {
      changed: false,
      timeoutWindowsConsumed: 0,
      phaseTransitions: 0,
      revealAdvances: 0,
      autoSubmittedClaims: 0,
      autoSubmittedChallenges: 0,
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
      safetyCounter < LIARS_PARTY_TIMEOUT_FALLBACK_MAX_ITERATIONS
    ) {
      safetyCounter += 1
      const timeoutAt = phaseStartedAt + timeoutMs
      const data = this.state.data as LiarsPartyGameData

      if (data.phase === 'claim') {
        if (!data.claim) {
          data.claim = {
            playerId: data.currentClaimantId,
            text: this.buildTimeoutFallbackClaim(data.currentClaimantId, data.currentRound),
            isBluff: false,
            submittedAt: timeoutAt,
            autoSubmitted: true,
          }

          result.changed = true
          result.autoSubmittedClaims += 1
          if (!result.autoSubmittedPlayerIds.includes(data.currentClaimantId)) {
            result.autoSubmittedPlayerIds.push(data.currentClaimantId)
          }
        }

        data.phase = 'challenge'
        data.submittedPlayerIds = []
        if (this.getCurrentRoundVoterIds(data).length === 0) {
          data.phase = 'reveal'
        }
        this.state.lastMoveAt = timeoutAt

        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.phaseTransitions += 1
        phaseStartedAt = timeoutAt
        continue
      }

      if (data.phase === 'challenge') {
        const pendingPlayers = this.getPendingChallengePlayerIds()
        for (const pendingPlayerId of pendingPlayers) {
          data.challengeVotes.push({
            playerId: pendingPlayerId,
            decision: 'believe',
            submittedAt: timeoutAt,
            autoSubmitted: true,
          })
          data.submittedPlayerIds.push(pendingPlayerId)
          result.autoSubmittedChallenges += 1
          if (!result.autoSubmittedPlayerIds.includes(pendingPlayerId)) {
            result.autoSubmittedPlayerIds.push(pendingPlayerId)
          }
        }

        if (pendingPlayers.length > 0) {
          result.changed = true
        }

        if (data.submittedPlayerIds.length < this.getCurrentRoundVoterIds(data).length) {
          break
        }

        data.phase = 'reveal'
        data.submittedPlayerIds = []
        this.state.lastMoveAt = timeoutAt

        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.phaseTransitions += 1
        phaseStartedAt = timeoutAt
        continue
      }

      if (data.phase === 'reveal') {
        this.advanceAfterReveal(data, timeoutAt)
        this.state.lastMoveAt = timeoutAt
        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.revealAdvances += 1
        phaseStartedAt = timeoutAt
        continue
      }

      break
    }

    return result
  }

  private advanceAfterReveal(data: LiarsPartyGameData, nowMs: number): void {
    if (!data.currentRoundResolved) {
      this.resolveCurrentRound(data, nowMs)
    }

    if (data.activePlayerIds.length <= 1) {
      this.finalizeGame(data, 'last-player-standing', nowMs)
      return
    }

    if (data.currentRound >= data.maxRounds) {
      this.finalizeGame(data, 'max-rounds-reached', nowMs)
      return
    }

    const nextClaimant = this.resolveNextActiveClaimant(data)
    if (!nextClaimant) {
      this.finalizeGame(data, 'max-rounds-reached', nowMs)
      return
    }

    data.currentRound += 1
    data.currentClaimantId = nextClaimant.playerId
    data.currentClaimantIndex = nextClaimant.claimantIndex
    data.phase = 'claim'
    data.claim = null
    data.challengeVotes = []
    data.submittedPlayerIds = []
    data.currentRoundResolved = false
    this.state.lastMoveAt = nowMs
  }

  private resolveCurrentRound(data: LiarsPartyGameData, nowMs: number): void {
    const claim = data.claim
    if (!claim) {
      return
    }

    const challengedBy = data.challengeVotes
      .filter((vote) => vote.decision === 'challenge')
      .map((vote) => vote.playerId)
    const believedBy = data.challengeVotes
      .filter((vote) => vote.decision === 'believe')
      .map((vote) => vote.playerId)
    const wasBluff = claim.isBluff
    const bluffCaught = wasBluff && challengedBy.length > believedBy.length
    const fooledPlayers = wasBluff ? believedBy.length : 0

    let claimantScoreDelta = 0
    let claimantStrikeDelta = 0

    if (wasBluff) {
      if (bluffCaught) {
        claimantScoreDelta += SCORE_BLUFF_CAUGHT_PENALTY
        claimantStrikeDelta = 1
      } else {
        claimantScoreDelta += SCORE_SUCCESSFUL_BLUFF_BASE
        claimantScoreDelta += fooledPlayers * SCORE_SUCCESSFUL_BLUFF_PER_FOOLED
      }
    } else {
      claimantScoreDelta += challengedBy.length > believedBy.length
        ? SCORE_TRUTH_CHALLENGED_BONUS
        : SCORE_TRUTH_BELIEVED_BONUS
    }

    if (claim.autoSubmitted) {
      claimantScoreDelta -= SCORE_AUTO_SUBMISSION_PENALTY
    }

    this.applyScoreDelta(data, claim.playerId, claimantScoreDelta)
    if (claimantStrikeDelta > 0) {
      data.strikes[claim.playerId] = (data.strikes[claim.playerId] || 0) + claimantStrikeDelta
      if ((data.strikes[claim.playerId] || 0) >= data.eliminationThreshold) {
        this.eliminatePlayer(data, claim.playerId)
      }
    }

    const voterScoreDeltas: Record<string, number> = {}
    for (const vote of data.challengeVotes) {
      let scoreDelta = 0
      if (vote.decision === 'challenge') {
        scoreDelta += wasBluff ? SCORE_CHALLENGE_CORRECT : SCORE_CHALLENGE_WRONG
      } else {
        scoreDelta += wasBluff ? SCORE_BELIEVE_WRONG : SCORE_BELIEVE_CORRECT
      }

      if (vote.autoSubmitted) {
        scoreDelta -= SCORE_AUTO_SUBMISSION_PENALTY
      }

      voterScoreDeltas[vote.playerId] = scoreDelta
      this.applyScoreDelta(data, vote.playerId, scoreDelta)
    }

    data.roundResults.push({
      round: data.currentRound,
      claimantId: claim.playerId,
      claimText: claim.text,
      wasBluff,
      challengedBy,
      believedBy,
      bluffCaught,
      fooledPlayers,
      claimantScoreDelta,
      voterScoreDeltas,
      claimantStrikeDelta,
      resolvedAt: nowMs,
    })

    data.currentRoundResolved = true
    this.recomputeRanking(data)
  }

  private applyScoreDelta(data: LiarsPartyGameData, playerId: string, delta: number): void {
    const previous = data.scores[playerId] || 0
    const nextScore = Math.max(0, previous + delta)
    data.scores[playerId] = nextScore

    const statePlayer = this.state.players.find((player) => player.id === playerId)
    if (statePlayer) {
      statePlayer.score = nextScore
    }
  }

  private eliminatePlayer(data: LiarsPartyGameData, playerId: string): void {
    if (!data.activePlayerIds.includes(playerId)) {
      return
    }

    data.activePlayerIds = data.activePlayerIds.filter((entry) => entry !== playerId)
    if (!data.eliminatedPlayerIds.includes(playerId)) {
      data.eliminatedPlayerIds.push(playerId)
    }
    if (data.eliminatedAtRound[playerId] === null) {
      data.eliminatedAtRound[playerId] = data.currentRound
    }

    const statePlayer = this.state.players.find((player) => player.id === playerId)
    if (statePlayer) {
      statePlayer.isActive = false
    }
  }

  private recomputeRanking(data: LiarsPartyGameData): void {
    const playerOrder = new Map<string, number>(
      this.state.players.map((player, index) => [player.id, index])
    )
    const activeSet = new Set(data.activePlayerIds)

    const ranking = this.state.players
      .map((player) => player.id)
      .sort((leftId, rightId) => {
        const leftActive = activeSet.has(leftId)
        const rightActive = activeSet.has(rightId)
        if (leftActive !== rightActive) {
          return leftActive ? -1 : 1
        }

        const scoreDelta = (data.scores[rightId] || 0) - (data.scores[leftId] || 0)
        if (scoreDelta !== 0) {
          return scoreDelta
        }

        const strikeDelta = (data.strikes[leftId] || 0) - (data.strikes[rightId] || 0)
        if (strikeDelta !== 0) {
          return strikeDelta
        }

        const leftEliminatedAt = data.eliminatedAtRound[leftId]
        const rightEliminatedAt = data.eliminatedAtRound[rightId]
        if (typeof leftEliminatedAt === 'number' && typeof rightEliminatedAt === 'number') {
          const eliminationDelta = rightEliminatedAt - leftEliminatedAt
          if (eliminationDelta !== 0) {
            return eliminationDelta
          }
        }

        return (playerOrder.get(leftId) || 0) - (playerOrder.get(rightId) || 0)
      })

    data.ranking = ranking
    data.winnerId = ranking[0] || null
  }

  private finalizeGame(
    data: LiarsPartyGameData,
    reason: LiarsPartyGameData['completionReason'],
    nowMs: number,
  ): void {
    this.recomputeRanking(data)
    data.completionReason = reason
    data.finishedAt = nowMs
    data.winnerId = data.ranking[0] || null
    this.state.status = 'finished'
    this.state.winner = data.winnerId ?? undefined
    this.state.lastMoveAt = nowMs
  }

  private resolveNextActiveClaimant(
    data: LiarsPartyGameData,
  ): { playerId: string; claimantIndex: number } | null {
    if (data.claimantOrder.length === 0 || data.activePlayerIds.length === 0) {
      return null
    }

    for (let offset = 1; offset <= data.claimantOrder.length; offset += 1) {
      const nextIndex = (data.currentClaimantIndex + offset) % data.claimantOrder.length
      const nextPlayerId = data.claimantOrder[nextIndex]
      if (nextPlayerId && data.activePlayerIds.includes(nextPlayerId)) {
        return { playerId: nextPlayerId, claimantIndex: nextIndex }
      }
    }

    return null
  }

  private getCurrentRoundVoterIds(data: LiarsPartyGameData): string[] {
    return data.activePlayerIds.filter((playerId) => playerId !== data.currentClaimantId)
  }

  private isKnownPlayer(playerId: string): boolean {
    return this.state.players.some((player) => player.id === playerId)
  }

  private isActivePlayer(playerId: string, data: LiarsPartyGameData): boolean {
    return data.activePlayerIds.includes(playerId)
  }

  private resolveMaxRounds(): number {
    const rawMaxRounds = (this.config.rules as { maxRounds?: unknown } | undefined)?.maxRounds
    if (typeof rawMaxRounds === 'number' && Number.isFinite(rawMaxRounds) && rawMaxRounds > 0) {
      return Math.min(MAX_MAX_ROUNDS, Math.max(MIN_MAX_ROUNDS, Math.floor(rawMaxRounds)))
    }
    return DEFAULT_MAX_ROUNDS
  }

  private resolveEliminationThreshold(): number {
    const rawThreshold = (this.config.rules as { eliminationStrikes?: unknown } | undefined)?.eliminationStrikes
    if (typeof rawThreshold === 'number' && Number.isFinite(rawThreshold) && rawThreshold > 0) {
      return Math.min(
        MAX_ELIMINATION_THRESHOLD,
        Math.max(MIN_ELIMINATION_THRESHOLD, Math.floor(rawThreshold))
      )
    }
    return DEFAULT_ELIMINATION_THRESHOLD
  }

  private getStringField(data: Record<string, unknown>, key: string): string | null {
    const value = data[key]
    return typeof value === 'string' ? value : null
  }

  private buildTimeoutFallbackClaim(playerId: string, round: number): string {
    return `[AUTO TIMEOUT] ${playerId} submitted no claim in round ${round}.`
  }
}
