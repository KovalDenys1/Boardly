import { Move } from '@/lib/game-engine'
import {
  BOARD_SIZE,
  CheckersCell,
  CheckersGame,
  CheckersGameData,
  CheckersStep,
  CheckersTurn,
  Side,
  applyTurn,
  generateTurns,
  isKing,
  otherSide,
  pieceSide,
} from '@/lib/games/checkers-game'
import { BaseBot } from '../core/base-bot'
import { BotDifficulty } from '../core/bot-types'

/**
 * A whole turn, as the hops the executor submits one by one. Mid-chain (a
 * restored state whose `chainFrom` is set) it is the rest of that chain.
 */
export interface CheckersBotDecision {
  type: 'turn'
  steps: CheckersStep[]
}

const HARD_DEPTH = 5
/** Wall-clock cap for the hard search; the best move found so far is played when it runs out. */
const HARD_TIME_BUDGET_MS = 900
const WIN_SCORE = 100_000

type Board = readonly (readonly number[])[]

/** Material, kings and advancement from `side`'s point of view. */
export function evaluateCheckersBoard(board: Board, side: Side): number {
  let score = 0
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c]
      const owner = pieceSide(cell)
      if (!owner) continue
      let value: number
      if (isKing(cell)) {
        value = 170
      } else {
        // Rows advanced towards the crowning row.
        const advanced = owner === 1 ? BOARD_SIZE - 1 - r : r
        value = 100 + advanced * 4
        // A man on its own back row guards the crowning squares.
        if (advanced === 0) value += 6
      }
      // Central squares are worth a little more than the edge.
      if (c >= 2 && c <= 5 && r >= 2 && r <= 5) value += 3
      score += owner === side ? value : -value
    }
  }
  return score
}

export class CheckersBot extends BaseBot<CheckersGame, CheckersBotDecision> {
  private botUserId: string | null
  private deadline = 0

  constructor(gameEngine: CheckersGame, difficulty: BotDifficulty = 'medium', botUserId?: string) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
  }

  async makeDecision(): Promise<CheckersBotDecision> {
    const data = this.gameEngine.getState().data as CheckersGameData
    const side = data.currentSide

    // Mid-chain the only choices are the rest of that chain.
    if (data.chainFrom) {
      return { type: 'turn', steps: this.finishChain(data) }
    }

    const turns = generateTurns(data.board, side)
    if (turns.length === 0) throw new Error('No legal moves for checkers bot')

    let turn: CheckersTurn
    if (this.config.difficulty === 'easy') turn = this.pickRandom(turns)
    else if (this.config.difficulty === 'hard') turn = this.pickHard(data.board, side, turns)
    else turn = this.pickMedium(data.board, side, turns)

    return { type: 'turn', steps: turn.steps }
  }

  /** The move for one hop of the decision. */
  decisionToMove(decision: CheckersBotDecision, index = 0): Move {
    const playerId = this.botUserId || this.gameEngine.getCurrentPlayer()?.id
    if (!playerId) throw new Error('Unable to resolve bot player id for checkers move')
    const step = decision.steps[index]
    return { playerId, type: 'step', data: { from: step.from, to: step.to }, timestamp: new Date() }
  }

  evaluateState(): string {
    const state = this.gameEngine.getState()
    const data = state.data as CheckersGameData
    return `Checkers turn=${state.currentPlayerIndex} side=${data.currentSide} moves=${data.moveCount}`
  }

  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]
  }

  private finishChain(data: CheckersGameData): CheckersStep[] {
    const steps: CheckersStep[] = []
    // Walk the chain on a scratch engine so the same hop rules apply.
    const scratch = new CheckersGame('bot-scratch')
    scratch.restoreState(JSON.parse(JSON.stringify(this.gameEngine.getState())))
    const actor = scratch.getCurrentPlayer()?.id
    while (actor) {
      const current = scratch.getState().data as CheckersGameData
      if (!current.chainFrom || current.currentSide !== data.currentSide) break
      const options = scratch.getLegalSteps()
      if (options.length === 0) break
      const next = this.pickRandom(options)
      steps.push(next)
      scratch.makeMove({ playerId: actor, type: 'step', data: { from: next.from, to: next.to }, timestamp: new Date() })
    }
    return steps
  }

  /**
   * Medium: take the most pieces, never hand over a win in one, and otherwise
   * prefer the move that leaves the opponent the least to capture back.
   */
  private pickMedium(board: Board, side: Side, turns: CheckersTurn[]): CheckersTurn {
    const opponent = otherSide(side)
    let best: CheckersTurn[] = []
    let bestScore = Number.NEGATIVE_INFINITY
    for (const turn of turns) {
      const after = applyTurn(board, turn)
      const replies = generateTurns(after, opponent)
      let score = turn.captures * 100 + (turn.promotes ? 60 : 0)
      if (replies.length === 0) {
        score += WIN_SCORE
      } else {
        const worstReply = Math.max(...replies.map((reply) => reply.captures * 100 + (reply.promotes ? 60 : 0)))
        score -= worstReply
        // A reply after which we cannot move is a loss in one.
        if (replies.some((reply) => generateTurns(applyTurn(after, reply), side).length === 0)) score -= WIN_SCORE / 2
      }
      if (score > bestScore) {
        bestScore = score
        best = [turn]
      } else if (score === bestScore) {
        best.push(turn)
      }
    }
    return this.pickRandom(best)
  }

  /** Hard: alpha-beta over whole turns, depth 5, capped by wall clock. */
  private pickHard(board: Board, side: Side, turns: CheckersTurn[]): CheckersTurn {
    if (turns.length === 1) return turns[0]
    this.deadline = Date.now() + HARD_TIME_BUDGET_MS
    // Captures first so the cut-offs come early.
    const ordered = [...turns].sort((a, b) => b.captures - a.captures)
    // Strictly better only: under alpha-beta a later move that merely ties the
    // bound is an upper bound, not an equal, so it cannot join a tie.
    let bestTurn = ordered[0]
    let alpha = Number.NEGATIVE_INFINITY
    for (const turn of ordered) {
      const score = -this.negamax(applyTurn(board, turn), otherSide(side), HARD_DEPTH - 1, Number.NEGATIVE_INFINITY, -alpha)
      if (score > alpha) {
        alpha = score
        bestTurn = turn
      }
      if (Date.now() > this.deadline) break
    }
    return bestTurn
  }

  private negamax(board: CheckersCell[][], side: Side, depth: number, alpha: number, beta: number): number {
    const turns = generateTurns(board, side)
    if (turns.length === 0) return -(WIN_SCORE + depth)
    if (depth === 0 || Date.now() > this.deadline) return evaluateCheckersBoard(board, side)
    turns.sort((a, b) => b.captures - a.captures)
    let best = Number.NEGATIVE_INFINITY
    for (const turn of turns) {
      const score = -this.negamax(applyTurn(board, turn), otherSide(side), depth - 1, -beta, -alpha)
      if (score > best) best = score
      if (score > alpha) alpha = score
      if (alpha >= beta) break
    }
    return best
  }
}
