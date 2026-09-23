import { Move } from '@/lib/game-engine'
import {
  LudoGame,
  LudoMoveOption,
  LudoColor,
  LUDO_FINISH,
  LUDO_HOME_COLUMN_START,
  LUDO_LAST_TRACK_STEP,
  LUDO_TRACK_LENGTH,
  LUDO_YARD,
  absoluteSquare,
  isSafeSquare,
} from '@/lib/games/ludo-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

export type LudoBotDecision =
  | { type: 'roll' }
  | { type: 'move'; token: number }

/**
 * Ludo bot (#1084).
 *
 * - easy: any legal token, at random.
 * - medium: a fixed preference order – capture, leave the yard, reach home or
 *   the home column, land on a safe square – then the token furthest along.
 * - hard: scores every option on capture value, progress, safety and how many
 *   opponents sit one to six squares behind where the token would land.
 *
 * The bot never rolls for itself: a roll is a move the server resolves, the
 * same as a person's.
 */
export class LudoBot extends BaseBot<LudoGame, LudoBotDecision> {
  private botUserId: string | null

  constructor(gameEngine: LudoGame, difficulty: BotDifficulty = 'medium', botUserId?: string) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
  }

  async makeDecision(): Promise<LudoBotDecision> {
    const playerId = this.resolvePlayerId()
    if (this.gameEngine.getEffectivePhase() === 'roll') return { type: 'roll' }

    const data = this.gameEngine.getData()
    const options = this.gameEngine
      .getMoveOptionsFor(playerId, data.dice ?? 0)
      .filter((option) => data.legalTokens.includes(option.token))
    if (options.length === 0) throw new Error('No legal Ludo move for the bot')

    return { type: 'move', token: this.chooseOption(playerId, options).token }
  }

  decisionToMove(decision: LudoBotDecision): Move {
    const playerId = this.resolvePlayerId()
    if (decision.type === 'roll') {
      return { playerId, type: 'roll', data: {}, timestamp: new Date() }
    }
    return { playerId, type: 'move', data: { token: decision.token }, timestamp: new Date() }
  }

  evaluateState(): string {
    const state = this.gameEngine.getState()
    const data = this.gameEngine.getData()
    return `Ludo turn=${state.currentPlayerIndex} phase=${this.gameEngine.getEffectivePhase()} dice=${data.dice ?? '-'}`
  }

  chooseOption(playerId: string, options: LudoMoveOption[]): LudoMoveOption {
    if (options.length === 1) return options[0]
    switch (this.config.difficulty) {
      case 'easy':
        return options[Math.floor(Math.random() * options.length)]
      case 'hard':
        return this.pickHard(playerId, options)
      default:
        return this.pickMedium(playerId, options)
    }
  }

  private resolvePlayerId(): string {
    const playerId = this.botUserId || this.gameEngine.getCurrentPlayer()?.id
    if (!playerId) throw new Error('Unable to resolve bot player id for Ludo move')
    return playerId
  }

  private pickMedium(playerId: string, options: LudoMoveOption[]): LudoMoveOption {
    const color = this.gameEngine.getColor(playerId)
    const rank = (option: LudoMoveOption): number => {
      if (option.captures.length > 0) return 5
      if (option.entersBoard) return 4
      if (option.reachesHome || option.to >= LUDO_HOME_COLUMN_START) return 3
      const square = color ? absoluteSquare(color, option.to) : null
      if (square !== null && isSafeSquare(square)) return 2
      return 1
    }
    return [...options].sort((a, b) => rank(b) - rank(a) || b.from - a.from)[0]
  }

  private pickHard(playerId: string, options: LudoMoveOption[]): LudoMoveOption {
    let best = options[0]
    let bestScore = Number.NEGATIVE_INFINITY
    for (const option of options) {
      const score = this.scoreOption(playerId, option)
      if (score > bestScore) {
        bestScore = score
        best = option
      }
    }
    return best
  }

  /** Higher is better. Exposed for tests through chooseOption only. */
  private scoreOption(playerId: string, option: LudoMoveOption): number {
    const color = this.gameEngine.getColor(playerId)
    if (!color) return 0
    let score = 0

    for (const capture of option.captures) {
      // Sending back a token that was far along costs its owner the most.
      score += 60 + Math.max(0, capture.from) * 0.8
    }
    if (option.reachesHome) score += 45
    else if (option.to >= LUDO_HOME_COLUMN_START && option.from <= LUDO_LAST_TRACK_STEP) score += 28
    if (option.entersBoard) score += 22

    score += (option.to - Math.max(0, option.from)) * 0.6

    const landing = absoluteSquare(color, option.to)
    if (landing !== null) {
      if (isSafeSquare(landing)) score += 14
      else score -= this.threatsTo(playerId, landing) * 22
    }

    const leaving = option.from === LUDO_YARD ? null : absoluteSquare(color, option.from)
    if (leaving !== null && !isSafeSquare(leaving)) {
      // Moving a token out of reach is worth what it would have cost to stay.
      score += this.threatsTo(playerId, leaving) * 16
    }

    return score
  }

  /** Opponent tokens that could land on `square` with a single roll of 1-6. */
  private threatsTo(playerId: string, square: number): number {
    const data = this.gameEngine.getData()
    let threats = 0
    for (const seat of data.seats) {
      if (seat.playerId === playerId) continue
      for (const position of data.tokens[seat.playerId] ?? []) {
        if (this.canReach(seat.color, position, square)) threats += 1
      }
    }
    return threats
  }

  private canReach(color: LudoColor, position: number, square: number): boolean {
    // A yard token can only come out onto its start square, which is safe.
    if (position === LUDO_YARD) return false
    const from = absoluteSquare(color, position)
    if (from === null) return false
    const distance = (square - from + LUDO_TRACK_LENGTH) % LUDO_TRACK_LENGTH
    if (distance < 1 || distance > 6) return false
    // The opponent turns into their home column after step 50 and never reaches it.
    return position + distance <= LUDO_LAST_TRACK_STEP && position + distance < LUDO_FINISH
  }
}
