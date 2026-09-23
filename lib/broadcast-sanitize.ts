import type { SupportedGameType } from './game-registry'
import { sanitizeSpyStateForBroadcast } from './games/spy-game'
import { sanitizeRpsStateForBroadcast } from './games/rock-paper-scissors-game'
import { sanitizeSketchAndGuessStateForBroadcast } from './games/sketch-and-guess-game'
import { sanitizeMemoryStateForBroadcast } from './games/memory-game'
import { sanitizeAliasStateForBroadcast } from './games/alias'
import { sanitizeFakeArtistStateForBroadcast } from './games/fake-artist-game'

/**
 * Single dispatch point for "strip secrets before this state leaves the
 * server" — used by every route that broadcasts or returns authoritative
 * game state (move-processing, bot-turn, lobby poll). Previously each route
 * hand-rolled its own `gameType === 'x' ? sanitizeX() : ...` ternary, and
 * they'd already drifted: the bot-turn route was missing the guess_the_spy
 * branch entirely (harmless today since Spy has no bot support, but a
 * landmine for the next bot-enabled sanitized game type).
 *
 * `viewerUserId` is only meaningful for sanitizers that keep a viewer's own
 * not-yet-revealed data visible to themselves; pass `null` for a shared
 * broadcast payload with no single viewer, which redacts for everyone.
 */
type Sanitizer = <T extends { data?: unknown; status?: string }>(
  state: T,
  viewerUserId: string | null,
  options?: SanitizeOptions
) => T

/** Per-viewer extras a sanitizer may use. */
export interface SanitizeOptions {
  /** The lobby's creator. Sketch & Guess shows them near-miss guesses they are allowed to judge. */
  hostUserId?: string | null
}

/**
 * Every supported game must make an explicit sanitization decision. `null` means
 * "this game has no hidden state" and is a deliberate declaration, not a default
 * — the `Record<SupportedGameType, …>` type makes adding a game without deciding
 * a compile error.
 *
 * This exhaustiveness is the actual fix for #716: the dispatcher previously fell
 * through to `default: return state`, so nine of eleven games silently shipped
 * their secrets and each new game inherited the same silence.
 */
const SANITIZERS: Record<SupportedGameType, Sanitizer | null> = {
  guess_the_spy: (state) => sanitizeSpyStateForBroadcast(state),
  rock_paper_scissors: (state, viewerUserId) => sanitizeRpsStateForBroadcast(state, viewerUserId),
  sketch_and_guess: (state, viewerUserId, options) =>
    sanitizeSketchAndGuessStateForBroadcast(state, viewerUserId, { hostUserId: options?.hostUserId ?? null }),
  memory: (state) => sanitizeMemoryStateForBroadcast(state),
  alias: (state, viewerUserId) => sanitizeAliasStateForBroadcast(state, viewerUserId),
  fake_artist: (state, viewerUserId) => sanitizeFakeArtistStateForBroadcast(state, viewerUserId),

  // No hidden state: the whole board is public by design.
  tic_tac_toe: null,
  connect_four: null,
  checkers: null,
  yahtzee: null,
  // Tokens, dice and roll history are all on the table.
  ludo: null,
  // Every claim and challenge is made in the open; the bluff is social, not informational.
  liars_party: null,
  // Each step is revealed to the next player in the chain by design, and the
  // full chain is only assembled at the reveal phase.
  telephone_doodle: null,
}

function isSupportedGameType(gameType: string): gameType is SupportedGameType {
  return Object.prototype.hasOwnProperty.call(SANITIZERS, gameType)
}

export function sanitizeStateForBroadcast<T extends { data?: unknown; status?: string }>(
  gameType: string,
  state: T,
  viewerUserId: string | null = null,
  options: SanitizeOptions = {}
): T {
  if (!isSupportedGameType(gameType)) {
    return state
  }

  const sanitizer = SANITIZERS[gameType]
  return sanitizer ? sanitizer(state, viewerUserId, options) : state
}
