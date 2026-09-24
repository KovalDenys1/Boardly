import { Move } from '@/lib/game-engine'
import {
  BOARD_SIZE,
  CheckersCell,
  CheckersGame,
  CheckersGameData,
  CheckersStep,
  Side,
  applyTurn,
  generateTurns,
  hasLegalMove,
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

/**
 * Wall-clock budget for the hard search. Iterative deepening runs until it is
 * spent and plays the best move of the last depth it finished, so the bot-turn
 * route's serverless invocation never spends more than about a second thinking.
 */
export const CHECKERS_HARD_TIME_BUDGET_MS = 900
/** Deepest iteration; far past what the budget reaches from the opening. */
const MAX_DEPTH = 20
const WIN_SCORE = 100_000
/** How often, in visited nodes, the search looks at the clock. */
const CLOCK_CHECK_INTERVAL = 128

type Board = readonly (readonly number[])[]

/** One choice at the root: the hops to submit and the board they leave, captures lifted. */
interface Candidate {
  steps: CheckersStep[]
  board: CheckersCell[][]
  captures: number
  promotes: boolean
}

export interface CheckersBotOptions {
  /** Overrides CHECKERS_HARD_TIME_BUDGET_MS; tests use a small one. Never above it. */
  timeBudgetMs?: number
}

/** Thrown inside the search when the budget runs out; the unfinished depth is discarded. */
class SearchTimeout extends Error {}

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
  private readonly timeBudgetMs: number
  private deadline = 0
  private nodes = 0

  constructor(gameEngine: CheckersGame, difficulty: BotDifficulty = 'medium', botUserId?: string, options: CheckersBotOptions = {}) {
    super(gameEngine, difficulty)
    this.botUserId = botUserId ?? null
    this.timeBudgetMs = Math.min(options.timeBudgetMs ?? CHECKERS_HARD_TIME_BUDGET_MS, CHECKERS_HARD_TIME_BUDGET_MS)
  }

  async makeDecision(): Promise<CheckersBotDecision> {
    const data = this.gameEngine.getState().data as CheckersGameData
    const side = data.currentSide

    // Mid-chain the only choices are the ways to finish that chain.
    const candidates = data.chainFrom ? this.chainCandidates() : this.turnCandidates(data.board, side)
    if (candidates.length === 0) throw new Error('No legal moves for checkers bot')

    let chosen: Candidate
    if (this.config.difficulty === 'easy') chosen = this.pickRandom(candidates)
    else if (this.config.difficulty === 'hard') chosen = this.pickHard(side, candidates)
    else chosen = this.pickMedium(side, candidates)

    return { type: 'turn', steps: chosen.steps }
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

  private turnCandidates(board: Board, side: Side): Candidate[] {
    return generateTurns(board, side).map((turn) => ({
      steps: turn.steps,
      board: applyTurn(board, turn),
      captures: turn.captures,
      promotes: turn.promotes,
    }))
  }

  /**
   * Every way to finish the chain the engine is in the middle of, walked on
   * scratch engines so the same hop rules apply, each with the board it leaves.
   */
  private chainCandidates(): Candidate[] {
    const out: Candidate[] = []
    const walk = (engine: CheckersGame, steps: CheckersStep[]) => {
      const data = engine.getState().data as CheckersGameData
      const actor = engine.getCurrentPlayer()?.id
      if (steps.length > 0 && (!data.chainFrom || !actor)) {
        out.push({
          steps,
          board: data.board.map((row) => [...row]) as CheckersCell[][],
          captures: steps.length,
          promotes: data.lastMove?.promoted === true,
        })
        return
      }
      if (!actor) return
      for (const step of engine.getLegalSteps()) {
        const branch = new CheckersGame('bot-scratch')
        branch.restoreState(JSON.parse(JSON.stringify(engine.getState())))
        branch.makeMove({ playerId: actor, type: 'step', data: { from: step.from, to: step.to }, timestamp: new Date() })
        walk(branch, [...steps, step])
      }
    }
    const root = new CheckersGame('bot-scratch')
    root.restoreState(JSON.parse(JSON.stringify(this.gameEngine.getState())))
    walk(root, [])
    return out
  }

  /**
   * Medium: take the most pieces, never hand over a win in one, and otherwise
   * prefer the move that leaves the opponent the least to capture back.
   */
  private pickMedium(side: Side, candidates: Candidate[]): Candidate {
    const opponent = otherSide(side)
    let best: Candidate[] = []
    let bestScore = Number.NEGATIVE_INFINITY
    for (const candidate of candidates) {
      let score = candidate.captures * 100 + (candidate.promotes ? 60 : 0)
      // generateTurns is only expensive when captures chain; a quiet reply set is
      // just the single steps, and "can we still move" is the cheap check.
      const replies = generateTurns(candidate.board, opponent)
      if (replies.length === 0) {
        score += WIN_SCORE
      } else {
        let worstReply = 0
        let lossInOne = false
        for (const reply of replies) {
          worstReply = Math.max(worstReply, reply.captures * 100 + (reply.promotes ? 60 : 0))
          if (!lossInOne && !hasLegalMove(applyTurn(candidate.board, reply), side)) lossInOne = true
        }
        score -= worstReply
        if (lossInOne) score -= WIN_SCORE / 2
      }
      if (score > bestScore) {
        bestScore = score
        best = [candidate]
      } else if (score === bestScore) {
        best.push(candidate)
      }
    }
    return this.pickRandom(best)
  }

  /**
   * Hard: iterative-deepening alpha-beta over whole turns, capped by wall clock.
   * The move played is from the last depth that finished; a depth the clock
   * interrupted is thrown away whole, so a root move searched halfway can never
   * win on a score that is really a bound. Equal best moves are drawn at random.
   */
  private pickHard(side: Side, candidates: Candidate[]): Candidate {
    if (candidates.length === 1) return candidates[0]
    this.deadline = Date.now() + this.timeBudgetMs
    this.nodes = 0

    // Captures first until a finished depth gives a better order.
    let ordered = [...candidates].sort((a, b) => b.captures - a.captures)
    let bestSet: Candidate[] = [ordered[0]]

    for (let depth = 1; depth <= MAX_DEPTH; depth++) {
      try {
        const scored = this.searchRoot(side, ordered, depth)
        const top = Math.max(...scored.map((s) => s.score))
        bestSet = scored.filter((s) => s.score === top).map((s) => s.candidate)
        ordered = scored.sort((a, b) => b.score - a.score).map((s) => s.candidate)
        // A forced win or loss is settled; searching deeper cannot change it.
        if (Math.abs(top) >= WIN_SCORE) break
      } catch (error) {
        if (error instanceof SearchTimeout) break
        throw error
      }
      if (Date.now() >= this.deadline) break
    }
    return this.pickRandom(bestSet)
  }

  /**
   * Exact scores for every root move that ties the best, bounds for the rest.
   * Each move is searched with alpha one below the best so far, so a move that
   * only matches the best comes back with its exact value instead of being cut.
   */
  private searchRoot(side: Side, ordered: Candidate[], depth: number): { candidate: Candidate; score: number }[] {
    const scored: { candidate: Candidate; score: number }[] = []
    let best = Number.NEGATIVE_INFINITY
    for (const candidate of ordered) {
      const alpha = best === Number.NEGATIVE_INFINITY ? best : best - 1
      const score = -this.negamax(candidate.board, otherSide(side), depth - 1, Number.NEGATIVE_INFINITY, -alpha)
      scored.push({ candidate, score })
      if (score > best) best = score
    }
    return scored
  }

  private negamax(board: CheckersCell[][], side: Side, depth: number, alpha: number, beta: number): number {
    if (++this.nodes % CLOCK_CHECK_INTERVAL === 0 && Date.now() >= this.deadline) throw new SearchTimeout()
    if (depth === 0) {
      return hasLegalMove(board, side) ? evaluateCheckersBoard(board, side) : -(WIN_SCORE + depth)
    }
    const turns = generateTurns(board, side)
    if (turns.length === 0) return -(WIN_SCORE + depth)
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
