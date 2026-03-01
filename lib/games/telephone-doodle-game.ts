import { GameConfig, GameEngine, Move, Player } from '../game-engine'

export type TelephoneDoodlePhase = 'prompt' | 'drawing' | 'caption' | 'reveal'
export type TelephoneDoodleStepPhase = Exclude<TelephoneDoodlePhase, 'reveal'>

export interface TelephoneDoodleStep {
  round: number
  phase: TelephoneDoodleStepPhase
  playerId: string
  content: string
  submittedAt: number
  autoSubmitted?: boolean
}

export interface TelephoneDoodleChain {
  id: string
  ownerId: string
  steps: TelephoneDoodleStep[]
}

export interface TelephoneDoodleScoreBreakdown {
  manualSubmissions: number
  autoSubmissions: number
  manualStepPoints: number
  autoSubmissionPenalty: number
  roundCompletionBonus: number
  perfectReliabilityBonus: number
  finalScore: number
}

export interface TelephoneDoodleGameData {
  phase: TelephoneDoodlePhase
  round: number
  maxRounds: number
  chains: TelephoneDoodleChain[]
  submittedPlayerIds: string[]
  revealIndex: number
  scores: Record<string, number>
  scoreBreakdown: Record<string, TelephoneDoodleScoreBreakdown>
  winnerId: string | null
  ranking: string[]
  completionReason: 'all-revealed' | null
  finishedAt: number | null
  isMvpScaffold: boolean
}

export interface TelephoneDoodleTimeoutResolution {
  changed: boolean
  timeoutWindowsConsumed: number
  phaseTransitions: number
  revealAdvances: number
  autoSubmittedSteps: number
  autoSubmittedPlayerIds: string[]
}

const STEP_PHASES: TelephoneDoodleStepPhase[] = ['prompt', 'drawing', 'caption']
const STEP_PHASE_OFFSETS: Record<TelephoneDoodleStepPhase, number> = {
  prompt: 0,
  drawing: 1,
  caption: 2,
}
const DEFAULT_MAX_ROUNDS = 1
const MIN_ROUNDS = 1
const MAX_ROUNDS = 10
const MIN_CONTENT_LENGTH = 3
const MAX_CONTENT_LENGTH = 500
const TELEPHONE_TIMEOUT_FALLBACK_MAX_ITERATIONS = 256
const SCORE_MANUAL_STEP_POINTS = 10
const SCORE_AUTO_SUBMISSION_PENALTY = 5
const SCORE_ROUND_COMPLETION_BONUS = 6
const SCORE_PERFECT_RELIABILITY_BONUS = 12

export class TelephoneDoodleGame extends GameEngine {
  constructor(gameId: string, config: GameConfig = { maxPlayers: 12, minPlayers: 3 }) {
    super(gameId, 'telephone_doodle', config)
  }

  getInitialGameData(): TelephoneDoodleGameData {
    return {
      phase: 'prompt',
      round: 1,
      maxRounds: this.resolveMaxRounds(),
      chains: [],
      submittedPlayerIds: [],
      revealIndex: 0,
      scores: {},
      scoreBreakdown: {},
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

    const data = this.state.data as TelephoneDoodleGameData
    data.phase = 'prompt'
    data.round = 1
    data.maxRounds = this.resolveMaxRounds()
    data.submittedPlayerIds = []
    data.revealIndex = 0
    data.scores = {}
    data.scoreBreakdown = {}
    data.winnerId = null
    data.ranking = []
    data.completionReason = null
    data.finishedAt = null
    data.chains = this.state.players.map((player) => ({
      id: `chain-${player.id}`,
      ownerId: player.id,
      steps: [],
    }))
    this.recomputeScoreboard(data)
    return true
  }

  validateMove(move: Move): boolean {
    const data = this.state.data as TelephoneDoodleGameData
    if (this.state.status !== 'playing') {
      return false
    }

    if (!this.state.players.some((player) => player.id === move.playerId)) {
      return false
    }

    if (data.phase === 'reveal') {
      return move.type === 'advance-reveal'
    }

    if (move.type !== 'submit-step') {
      return false
    }

    if (data.submittedPlayerIds.includes(move.playerId)) {
      return false
    }

    const stepPhase = this.getCurrentStepPhase(data)
    if (!stepPhase) {
      return false
    }

    const chainId = this.getChainId(move.data)
    const expectedChainId = this.resolveAssignedChainId(move.playerId, stepPhase, data.round, data)
    if (!chainId || !expectedChainId || chainId !== expectedChainId) {
      return false
    }

    const chain = data.chains.find((entry) => entry.id === chainId)
    if (!chain) {
      return false
    }

    const duplicateStep = chain.steps.some((step) => step.round === data.round && step.phase === stepPhase)
    if (duplicateStep) {
      return false
    }

    const content = this.getContent(move.data)
    if (!content) {
      return false
    }

    const normalizedLength = content.trim().length
    return normalizedLength >= MIN_CONTENT_LENGTH && normalizedLength <= MAX_CONTENT_LENGTH
  }

  processMove(move: Move): void {
    const data = this.state.data as TelephoneDoodleGameData

    if (data.phase === 'reveal') {
      if (move.type !== 'advance-reveal') {
        return
      }

      data.revealIndex += 1
      this.state.lastMoveAt = Date.now()
      if (data.revealIndex >= data.chains.length) {
        this.finalizeGame(data, 'all-revealed')
      }
      return
    }

    if (move.type !== 'submit-step') {
      return
    }

    const stepPhase = this.getCurrentStepPhase(data)
    const chainId = stepPhase
      ? this.resolveAssignedChainId(move.playerId, stepPhase, data.round, data)
      : null
    const content = this.getContent(move.data)
    if (!stepPhase || !chainId || !content) {
      return
    }

    const chain = data.chains.find((item) => item.id === chainId)
    if (!chain) {
      return
    }

    chain.steps.push({
      round: data.round,
      phase: stepPhase,
      playerId: move.playerId,
      content: content.trim(),
      submittedAt: Date.now(),
    })
    this.recomputeScoreboard(data)
    data.submittedPlayerIds.push(move.playerId)

    if (data.submittedPlayerIds.length >= this.state.players.length) {
      data.submittedPlayerIds = []
      this.advancePhase(data, stepPhase)
      this.state.lastMoveAt = Date.now()
    }
  }

  checkWinCondition(): Player | null {
    if (this.state.status !== 'finished') {
      return null
    }

    const data = this.state.data as TelephoneDoodleGameData
    if (!data.winnerId) {
      return null
    }

    return this.state.players.find((player) => player.id === data.winnerId) || null
  }

  getGameRules(): string[] {
    return [
      'All players submit prompts, then turn prompts into drawings, then captions.',
      'Each step is submitted once per player in the active phase.',
      'If the phase timer expires, missing steps are auto-submitted and the phase auto-advances.',
      'After caption phase, chains are revealed one by one.',
      'MVP scoring rewards manual submissions and reliable rounds, while penalizing timeout auto-submits.',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return false
  }

  getAssignedChainIdForPlayer(playerId: string): string | null {
    const data = this.state.data as TelephoneDoodleGameData
    const stepPhase = this.getCurrentStepPhase(data)
    if (!stepPhase || this.state.status !== 'playing') {
      return null
    }
    return this.resolveAssignedChainId(playerId, stepPhase, data.round, data)
  }

  getPendingPlayerIdsForCurrentStep(): string[] {
    const data = this.state.data as TelephoneDoodleGameData
    const stepPhase = this.getCurrentStepPhase(data)
    if (!stepPhase || this.state.status !== 'playing') {
      return []
    }
    return this.state.players
      .map((player) => player.id)
      .filter((playerId) => !data.submittedPlayerIds.includes(playerId))
  }

  applyTimeoutFallback(turnTimerSeconds: number, nowMs: number = Date.now()): TelephoneDoodleTimeoutResolution {
    const result: TelephoneDoodleTimeoutResolution = {
      changed: false,
      timeoutWindowsConsumed: 0,
      phaseTransitions: 0,
      revealAdvances: 0,
      autoSubmittedSteps: 0,
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
      safetyCounter < TELEPHONE_TIMEOUT_FALLBACK_MAX_ITERATIONS
    ) {
      safetyCounter += 1
      const timeoutAt = phaseStartedAt + timeoutMs
      const data = this.state.data as TelephoneDoodleGameData
      const stepPhase = this.getCurrentStepPhase(data)

      if (stepPhase) {
        const autoSubmittedCount = this.autoSubmitPendingPlayersForPhase(data, stepPhase, timeoutAt)
        if (autoSubmittedCount > 0) {
          this.recomputeScoreboard(data)
          result.changed = true
          result.autoSubmittedSteps += autoSubmittedCount
          for (const autoSubmittedPlayerId of this.getAutoSubmittedPlayerIds(data, stepPhase, data.round)) {
            if (!result.autoSubmittedPlayerIds.includes(autoSubmittedPlayerId)) {
              result.autoSubmittedPlayerIds.push(autoSubmittedPlayerId)
            }
          }
        }

        if (data.submittedPlayerIds.length < this.state.players.length) {
          break
        }

        data.submittedPlayerIds = []
        this.advancePhase(data, stepPhase)
        this.state.lastMoveAt = timeoutAt

        result.changed = true
        result.timeoutWindowsConsumed += 1
        result.phaseTransitions += 1

        phaseStartedAt = timeoutAt
        continue
      }

      if (data.phase === 'reveal') {
        data.revealIndex += 1
        if (data.revealIndex >= data.chains.length) {
          this.finalizeGame(data, 'all-revealed')
        }
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

  private finalizeGame(data: TelephoneDoodleGameData, reason: 'all-revealed'): void {
    this.recomputeScoreboard(data)
    data.completionReason = reason
    data.finishedAt = Date.now()
    data.winnerId = data.ranking[0] || null
    this.state.status = 'finished'
    this.state.winner = data.winnerId ?? undefined
  }

  private recomputeScoreboard(data: TelephoneDoodleGameData): void {
    const manualSubmissionsByPlayer = new Map<string, number>()
    const autoSubmissionsByPlayer = new Map<string, number>()
    const roundCompletionByPlayer = new Map<string, number>()

    for (const player of this.state.players) {
      manualSubmissionsByPlayer.set(player.id, 0)
      autoSubmissionsByPlayer.set(player.id, 0)
      roundCompletionByPlayer.set(player.id, 0)
    }

    for (const chain of data.chains) {
      for (const step of chain.steps) {
        if (!manualSubmissionsByPlayer.has(step.playerId)) {
          continue
        }

        if (step.autoSubmitted) {
          autoSubmissionsByPlayer.set(step.playerId, (autoSubmissionsByPlayer.get(step.playerId) || 0) + 1)
        } else {
          manualSubmissionsByPlayer.set(step.playerId, (manualSubmissionsByPlayer.get(step.playerId) || 0) + 1)
        }
      }
    }

    for (let round = 1; round <= data.maxRounds; round += 1) {
      for (const player of this.state.players) {
        const manualPhases = new Set<TelephoneDoodleStepPhase>()
        for (const chain of data.chains) {
          for (const step of chain.steps) {
            if (
              step.round === round &&
              step.playerId === player.id &&
              !step.autoSubmitted
            ) {
              manualPhases.add(step.phase)
            }
          }
        }

        if (manualPhases.size === STEP_PHASES.length) {
          roundCompletionByPlayer.set(player.id, (roundCompletionByPlayer.get(player.id) || 0) + 1)
        }
      }
    }

    const nextScores: Record<string, number> = {}
    const nextScoreBreakdown: Record<string, TelephoneDoodleScoreBreakdown> = {}

    for (const player of this.state.players) {
      const manualSubmissions = manualSubmissionsByPlayer.get(player.id) || 0
      const autoSubmissions = autoSubmissionsByPlayer.get(player.id) || 0
      const completedRounds = roundCompletionByPlayer.get(player.id) || 0

      const manualStepPoints = manualSubmissions * SCORE_MANUAL_STEP_POINTS
      const autoSubmissionPenalty = autoSubmissions * SCORE_AUTO_SUBMISSION_PENALTY
      const roundCompletionBonus = completedRounds * SCORE_ROUND_COMPLETION_BONUS
      const perfectReliabilityBonus = autoSubmissions === 0 && manualSubmissions > 0
        ? SCORE_PERFECT_RELIABILITY_BONUS
        : 0

      const finalScore = Math.max(
        0,
        manualStepPoints + roundCompletionBonus + perfectReliabilityBonus - autoSubmissionPenalty,
      )

      nextScores[player.id] = finalScore
      nextScoreBreakdown[player.id] = {
        manualSubmissions,
        autoSubmissions,
        manualStepPoints,
        autoSubmissionPenalty,
        roundCompletionBonus,
        perfectReliabilityBonus,
        finalScore,
      }

      player.score = finalScore
    }

    const playerOrder = new Map<string, number>(
      this.state.players.map((player, index) => [player.id, index])
    )
    const ranking = this.state.players
      .map((player) => player.id)
      .sort((leftId, rightId) => {
        const scoreDelta = (nextScores[rightId] || 0) - (nextScores[leftId] || 0)
        if (scoreDelta !== 0) return scoreDelta

        const autoDelta =
          (nextScoreBreakdown[leftId]?.autoSubmissions || 0) -
          (nextScoreBreakdown[rightId]?.autoSubmissions || 0)
        if (autoDelta !== 0) return autoDelta

        const manualDelta =
          (nextScoreBreakdown[rightId]?.manualSubmissions || 0) -
          (nextScoreBreakdown[leftId]?.manualSubmissions || 0)
        if (manualDelta !== 0) return manualDelta

        return (playerOrder.get(leftId) || 0) - (playerOrder.get(rightId) || 0)
      })

    data.scores = nextScores
    data.scoreBreakdown = nextScoreBreakdown
    data.ranking = ranking
    data.winnerId = ranking[0] || null
  }

  private getCurrentStepPhase(data: TelephoneDoodleGameData): TelephoneDoodleStepPhase | null {
    if (data.phase === 'prompt' || data.phase === 'drawing' || data.phase === 'caption') {
      return data.phase
    }
    return null
  }

  private autoSubmitPendingPlayersForPhase(
    data: TelephoneDoodleGameData,
    phase: TelephoneDoodleStepPhase,
    submittedAt: number,
  ): number {
    const submittedPlayerSet = new Set(data.submittedPlayerIds)
    let createdSteps = 0

    for (const player of this.state.players) {
      if (submittedPlayerSet.has(player.id)) {
        continue
      }

      const chainId = this.resolveAssignedChainId(player.id, phase, data.round, data)
      if (!chainId) {
        continue
      }

      const chain = data.chains.find((entry) => entry.id === chainId)
      if (!chain) {
        continue
      }

      const duplicateStep = chain.steps.some((step) => step.round === data.round && step.phase === phase)
      if (!duplicateStep) {
        chain.steps.push({
          round: data.round,
          phase,
          playerId: player.id,
          content: this.buildTimeoutFallbackContent(phase, data.round, player.id, chainId),
          submittedAt,
          autoSubmitted: true,
        })
        createdSteps += 1
      }

      data.submittedPlayerIds.push(player.id)
      submittedPlayerSet.add(player.id)
    }

    return createdSteps
  }

  private getAutoSubmittedPlayerIds(
    data: TelephoneDoodleGameData,
    phase: TelephoneDoodleStepPhase,
    round: number,
  ): string[] {
    const playerIds = new Set<string>()
    for (const chain of data.chains) {
      for (const step of chain.steps) {
        if (step.round === round && step.phase === phase && step.autoSubmitted) {
          playerIds.add(step.playerId)
        }
      }
    }
    return Array.from(playerIds)
  }

  private buildTimeoutFallbackContent(
    phase: TelephoneDoodleStepPhase,
    round: number,
    playerId: string,
    chainId: string,
  ): string {
    if (phase === 'drawing') {
      return JSON.stringify({
        type: 'drawing',
        version: 1,
        autoSubmitted: true,
        reason: 'timeout',
        width: 64,
        height: 64,
        strokes: [
          {
            color: '#9ca3af',
            width: 2,
            points: [
              { x: 8, y: 8 },
              { x: 56, y: 56 },
            ],
          },
        ],
      })
    }

    return `[AUTO TIMEOUT] ${phase} skipped for ${playerId} in round ${round} (${chainId}).`
  }

  private getChainId(data: Record<string, unknown>): string | null {
    const chainId = data.chainId
    return typeof chainId === 'string' && chainId.length > 0 ? chainId : null
  }

  private getContent(data: Record<string, unknown>): string | null {
    const content = data.content
    return typeof content === 'string' ? content : null
  }

  private advancePhase(data: TelephoneDoodleGameData, completedPhase: TelephoneDoodleStepPhase): void {
    const currentIndex = STEP_PHASES.indexOf(completedPhase)
    if (currentIndex === -1) {
      return
    }

    const nextIndex = currentIndex + 1
    if (nextIndex < STEP_PHASES.length) {
      data.phase = STEP_PHASES[nextIndex]
      return
    }

    if (data.round < data.maxRounds) {
      data.round += 1
      data.phase = 'prompt'
      return
    }

    data.phase = 'reveal'
    data.revealIndex = 0
  }

  private resolveAssignedChainId(
    playerId: string,
    phase: TelephoneDoodleStepPhase,
    round: number,
    data: TelephoneDoodleGameData,
  ): string | null {
    const playerIndex = this.state.players.findIndex((player) => player.id === playerId)
    if (playerIndex === -1 || data.chains.length === 0) {
      return null
    }

    const phaseOffset = STEP_PHASE_OFFSETS[phase]
    const cycleOffset = (round - 1) * STEP_PHASES.length
    const totalOffset = phaseOffset + cycleOffset
    const chainIndex = (playerIndex + totalOffset) % data.chains.length

    return data.chains[chainIndex]?.id || null
  }

  private resolveMaxRounds(): number {
    const rawMaxRounds = (this.config.rules as { maxRounds?: unknown } | undefined)?.maxRounds
    if (typeof rawMaxRounds === 'number' && Number.isFinite(rawMaxRounds) && rawMaxRounds > 0) {
      return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.floor(rawMaxRounds)))
    }
    return DEFAULT_MAX_ROUNDS
  }
}
