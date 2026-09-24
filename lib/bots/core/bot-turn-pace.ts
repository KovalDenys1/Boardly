import { BotDifficulty } from './bot-types'
import { botUxDelayUpperBoundMs, resolveBotUxDelayMs } from './bot-ux-timing'

/**
 * How long one bot turn can go silent, and how long a client must therefore wait
 * before it concludes that nobody is driving that turn (#1049).
 *
 * A bot turn is not one write. `POST /api/game/[gameId]/bot-turn` broadcasts
 * `game-update` from its per-move callback only, so the client sees the turn
 * advance once per `onMove` and sees nothing at all during the `botDelay` pauses
 * the executor puts between them. Memory is the extreme case: the bot commits its
 * second flip, waits out `botDelay(difficulty, 1200)` so a human can read the two
 * cards, then `botDelay(difficulty, 180)` inside `resolveMismatch`, and only then
 * commits the move that ends the turn.
 *
 * So the client's recovery timer has to outlast the longest run of consecutive
 * pauses between two commits. That is a property of the executors, not a number
 * to pick: the arrays below are those runs, in the executors' own base
 * milliseconds, and `__tests__/lib/bots/bot-turn-pace.test.ts` runs each executor and
 * fails if the run it measures is not the one declared here.
 */
export type BotPacedGameType =
  | 'memory'
  | 'yahtzee'
  | 'tic_tac_toe'
  | 'connect_four'
  | 'rock_paper_scissors'
  | 'checkers'
  | 'ludo'

/**
 * The longest run of `botDelay` base values an executor puts between two
 * `onMove` commits - or, for a game whose turn is a single commit, between the
 * turn starting and that commit.
 *
 * - memory: `memory-bot-executor.ts` 85 (mismatch pause) then 160 (resolve)
 * - yahtzee: `yahtzee-bot-executor.ts` 164 + 177 (end of a roll) then 199 + 213
 *   (the score that ends the turn)
 * - tic_tac_toe / connect_four / rock_paper_scissors: one pause, one commit
 * - checkers: `checkers-bot-executor.ts` 150 before the first hop, then 250
 *   before each further hop of a capture chain, one commit per hop
 * - ludo: `ludo-bot-executor.ts` pauses once before every commit – 300 before a
 *   roll, 400 before a token move – so the longest silence is one move pause
 */
export const BOT_LONGEST_IN_TURN_PAUSE_BASES: Record<BotPacedGameType, readonly number[]> = {
  memory: [1200, 180],
  yahtzee: [150, 400, 300, 200],
  tic_tac_toe: [120],
  connect_four: [150],
  rock_paper_scissors: [200],
  checkers: [250],
  ludo: [400],
}

/**
 * What the client allows, on top of the bot's own pause, for the commit that
 * ends that pause to reach it: the Prisma write inside the bot-turn route plus
 * Supabase realtime delivery of the `game-update` broadcast.
 *
 * It is a margin, not a guarantee, and the live run says so. In a Yahtzee game
 * against an Easy bot on localhost on 2026-09-20 the bot's `bot-action` events
 * arrived within a few hundred milliseconds while the `game-update` for its last
 * commit had not arrived a second later, when the grace expired. What makes that
 * safe is `useBotTurn` reading the server before it writes; this constant only
 * keeps the ordinary case out of that path, and bounds how long the read's answer
 * is waited for. Spending it costs nothing when the server-side driver works, and
 * the turn timer is the real backstop when it does not.
 */
export const BOT_COMMIT_DELIVERY_ALLOWANCE_MS = 1_000

/**
 * Silence that is not a `botDelay`: a bot that searches before its first commit.
 * Checkers' hard bot deepens until `CHECKERS_HARD_TIME_BUDGET_MS` is spent
 * (lib/bots/checkers/checkers-bot.ts, pinned equal by the pace test), right
 * after the executor's 150 pause, so the longest checkers silence is bounded by
 * the pause table plus this. Kept here as a number rather than imported, so this
 * module stays free of any one game's bot.
 */
export const BOT_SEARCH_BUDGET_MS: Partial<Record<BotPacedGameType, number>> = {
  checkers: 900,
}

function upperBoundFor(gameType: BotPacedGameType): number {
  return sumUpperBounds(BOT_LONGEST_IN_TURN_PAUSE_BASES[gameType]) + (BOT_SEARCH_BUDGET_MS[gameType] ?? 0)
}

function sumUpperBounds(bases: readonly number[]): number {
  return bases.reduce((total, base) => total + botUxDelayUpperBoundMs(base), 0)
}

/**
 * The longest this game's bot can go between two commits under the environment
 * this process is running in. Exact on the server, where the `BOT_UX_DELAY_*`
 * variables are readable; the test pins it against the executors.
 */
export function resolveBotInTurnPauseMs(
  gameType: BotPacedGameType,
  difficulty: BotDifficulty,
): number {
  const search = difficulty === 'hard' ? (BOT_SEARCH_BUDGET_MS[gameType] ?? 0) : 0
  return BOT_LONGEST_IN_TURN_PAUSE_BASES[gameType].reduce(
    (total, base) => total + resolveBotUxDelayMs(difficulty, base),
    search,
  )
}

/**
 * The same figure as an upper bound over every difficulty and every permitted
 * `BOT_UX_DELAY_*` setting. This is the one the client uses: it runs in a browser,
 * where those server-only variables read as undefined, so it must not depend on
 * them - and `resolveBotUxDelayMs` guarantees it by bounding its own output.
 */
export function botInTurnPauseUpperBoundMs(gameType: BotPacedGameType | null | undefined): number {
  if (gameType && gameType in BOT_LONGEST_IN_TURN_PAUSE_BASES) return upperBoundFor(gameType)
  // An unknown game type has to be treated as the slowest known one: guessing
  // low is the failure this whole module exists to stop.
  return Math.max(...(Object.keys(BOT_LONGEST_IN_TURN_PAUSE_BASES) as BotPacedGameType[]).map(upperBoundFor))
}

/**
 * How long a client waits, after seeing a bot take or advance a turn, before it
 * sends a bot-turn request of its own.
 */
export function resolveBotTurnGraceMs(gameType: BotPacedGameType | null | undefined): number {
  return botInTurnPauseUpperBoundMs(gameType) + BOT_COMMIT_DELIVERY_ALLOWANCE_MS
}

export function isBotPacedGameType(value: unknown): value is BotPacedGameType {
  return typeof value === 'string' && value in BOT_LONGEST_IN_TURN_PAUSE_BASES
}
