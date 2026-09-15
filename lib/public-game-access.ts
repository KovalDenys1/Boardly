import { getAvailableGameTypes, getCatalogGames, isAvailableCatalogEntry, isRegisteredGameType } from './game-catalog'
import type { RegisteredGameType, SupportedCatalogGameType } from './game-catalog'

// An experimental game that already has a public lobbies route. It is not a
// RegisteredGameType, so it has to be named here or the route falls through
// isTemporarilyUnavailableGameType and the page offers a create button that
// drops the visitor into the default game's form.
type UpcomingPublicGameType = 'sketch_and_guess'
type LobbyRouteGameType = RegisteredGameType | UpcomingPublicGameType
type PublicGameType = RegisteredGameType | UpcomingPublicGameType

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
}

export function isTemporarilyUnavailableGameType(
  gameType: string | null | undefined
): gameType is PublicGameType {
  return (
    typeof gameType === 'string' &&
    gameType in GAME_LOBBIES_ROUTES &&
    !getAvailableGameTypes().includes(gameType as SupportedCatalogGameType)
  )
}

export function getGameLobbiesRoute(gameType: string | null | undefined): string | null {
  if (typeof gameType !== 'string') {
    return null
  }

  return GAME_LOBBIES_ROUTES[gameType as LobbyRouteGameType] ?? null
}

export function getPublicRegisteredGameTypes(): RegisteredGameType[] {
  return getAvailableGameTypes().filter(isRegisteredGameType)
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
