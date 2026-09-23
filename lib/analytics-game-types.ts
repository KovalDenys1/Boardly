/**
 * The game types analytics understands, and the one way to narrow into them (#1044).
 *
 * This lives apart from `lib/analytics.ts` for two reasons. The first is dependencies:
 * `analytics.ts` pulls in `@vercel/analytics`, so anything importing it for nothing but
 * a type check drags that in too, and a test that mocks the module loses the narrowing
 * along with the tracking. The second is drift. Two call sites used to keep their own
 * hardcoded copies of this list and both fell behind it, so Connect Four was reported
 * as Yahtzee for as long as the game has existed.
 *
 * The array is the source and the union is derived from it, so the two cannot disagree:
 * adding a game means editing one line here, and nothing else anywhere.
 */
export const ANALYTICS_GAME_TYPES = [
  'yahtzee',
  'tic_tac_toe',
  'rock_paper_scissors',
  'guess_the_spy',
  'memory',
  'alias',
  'liars_party',
  'connect_four',
  'sketch_and_guess',
  'checkers',
  'ludo',
] as const

export type AnalyticsGameType = (typeof ANALYTICS_GAME_TYPES)[number]

/**
 * Narrows the loosely-typed `lobby.gameType` (`string` on the `Lobby` type) to the
 * analytics union, or `undefined` when it is a game analytics does not know.
 */
export function toAnalyticsGameType(value: unknown): AnalyticsGameType | undefined {
  return typeof value === 'string' && (ANALYTICS_GAME_TYPES as readonly string[]).includes(value)
    ? (value as AnalyticsGameType)
    : undefined
}
