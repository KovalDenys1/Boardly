import { getAvailableGameTypes, isRegisteredGameType } from './game-catalog'
import type { RegisteredGameType, SupportedCatalogGameType } from './game-catalog'

type UpcomingPublicGameType = 'liars_party'
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
