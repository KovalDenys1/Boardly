import { getAvailableGameTypes, getCatalogGames, isAvailableCatalogEntry, isRegisteredGameType } from './game-catalog'
import type { CatalogReadOptions, RegisteredGameType, SupportedCatalogGameType } from './game-catalog'

// Sketch & Guess was the one entry here that was not a RegisteredGameType: it
// had a public lobbies route while its engine was still flag-gated, so it had
// to be named separately or the route fell through
// isTemporarilyUnavailableGameType and the page offered a create button that
// dropped the visitor into the default game's form. #1035 registered it, so
// the map is the registered set again. A future game in that position gets its
// own union member back.
type LobbyRouteGameType = RegisteredGameType
type PublicGameType = RegisteredGameType

const GAME_LOBBIES_ROUTES: Record<LobbyRouteGameType, string> = {
  yahtzee: '/games/yahtzee/lobbies',
  guess_the_spy: '/games/spy/lobbies',
  tic_tac_toe: '/games/tic-tac-toe/lobbies',
  rock_paper_scissors: '/games/rock-paper-scissors/lobbies',
  memory: '/games/memory/lobbies',
  connect_four: '/games/connect-four/lobbies',
  alias: '/games/alias/lobbies',
  liars_party: '/games/liars-party/lobbies',
  sketch_and_guess: '/games/sketch-and-guess/lobbies',
  checkers: '/games/checkers/lobbies',
}

/**
 * A game with a lobbies route that the catalog has not released, which is the 400 on
 * POST /api/lobby and POST /api/game/create.
 *
 * `options` reaches `getAvailableGameTypes` unchanged and no caller in the app passes it -
 * see `CatalogReadOptions`. Since #873 no shipped entry is both routed and unreleased, so
 * the `true` side of this predicate has no subject in the real catalog and a test that
 * wants one hands over a synthetic entry rather than asserting about nothing.
 */
export function isTemporarilyUnavailableGameType(
  gameType: string | null | undefined,
  options?: CatalogReadOptions
): gameType is PublicGameType {
  return (
    typeof gameType === 'string' &&
    gameType in GAME_LOBBIES_ROUTES &&
    !getAvailableGameTypes(options).includes(gameType as SupportedCatalogGameType)
  )
}

export function getGameLobbiesRoute(gameType: string | null | undefined): string | null {
  if (typeof gameType !== 'string') {
    return null
  }

  return GAME_LOBBIES_ROUTES[gameType as LobbyRouteGameType] ?? null
}

/**
 * The registered games the catalog has released - not the keys of GAME_LOBBIES_ROUTES.
 * A route is only where a game would live; availability is whether it is public yet.
 */
export function getPublicRegisteredGameTypes(options?: CatalogReadOptions): RegisteredGameType[] {
  return getAvailableGameTypes(options).filter(isRegisteredGameType)
}

export function getLobbyCreateRoute(gameType: string | null | undefined): string | null {
  if (typeof gameType !== 'string' || !gameType) {
    return null
  }

  return `/lobby/create?gameType=${encodeURIComponent(gameType)}`
}

/**
 * True only when `/lobby/create?gameType=` can actually open this game's own form.
 * The page builds every form from the catalog's `lobbyCreateConfig` and falls back to
 * the default game when the requested type has none, silently – so sending a visitor
 * there needs the same answer the page itself gives (`isSelectableGameType`).
 *
 * `isTemporarilyUnavailableGameType` does not answer it. It is false for every type it
 * has never heard of, `fake_artist` and `telephone_doodle` included, and false for a
 * flag-promoted experimental game that is available yet still has no create form.
 */
export function canCreateLobbyForGameType(gameType: string | null | undefined): boolean {
  if (typeof gameType !== 'string' || !gameType) {
    return false
  }

  return getCatalogGames().some(
    (game) => game.gameType === gameType && isAvailableCatalogEntry(game)
  )
}
