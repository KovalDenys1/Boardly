import { GameConfig, GameEngine, Move, Player } from '../game-engine'

export type TelephoneDoodlePhase = 'prompt' | 'drawing' | 'caption' | 'reveal'
export type TelephoneDoodleStepPhase = Exclude<TelephoneDoodlePhase, 'reveal'>

export interface TelephoneDoodleStep {
  round: number
  phase: TelephoneDoodleStepPhase
  playerId: string
  content: string
  submittedAt: number
}

export interface TelephoneDoodleChain {
  id: string
  ownerId: string
  steps: TelephoneDoodleStep[]
}

export interface TelephoneDoodleGameData {
  phase: TelephoneDoodlePhase
  round: number
  maxRounds: number
  chains: TelephoneDoodleChain[]
  submittedPlayerIds: string[]
  revealIndex: number
  isMvpScaffold: boolean
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
    data.chains = this.state.players.map((player) => ({
      id: `chain-${player.id}`,
      ownerId: player.id,
      steps: [],
    }))
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
      if (data.revealIndex >= data.chains.length) {
        this.state.status = 'finished'
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
    data.submittedPlayerIds.push(move.playerId)

    if (data.submittedPlayerIds.length >= this.state.players.length) {
      data.submittedPlayerIds = []
      this.advancePhase(data, stepPhase)
    }
  }

  checkWinCondition(): Player | null {
    return null
  }

  getGameRules(): string[] {
    return [
      'All players submit prompts, then turn prompts into drawings, then captions.',
      'Each step is submitted once per player in the active phase.',
      'After caption phase, chains are revealed one by one.',
      'This engine is an MVP scaffold and does not calculate final scoring yet.',
    ]
  }

  protected shouldAdvanceTurn(_move: Move): boolean {
    return false
  }

  private getCurrentStepPhase(data: TelephoneDoodleGameData): TelephoneDoodleStepPhase | null {
    if (data.phase === 'prompt' || data.phase === 'drawing' || data.phase === 'caption') {
      return data.phase
    }
    return null
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
