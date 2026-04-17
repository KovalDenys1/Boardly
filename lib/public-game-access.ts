import { getAllRegisteredGameTypes } from './game-catalog'
import type { RegisteredGameType } from './game-catalog'

type LobbyRouteGameType = RegisteredGameType | 'alias' | 'liars_party'

const TEMPORARILY_UNAVAILABLE_GAME_TYPES = new Set<RegisteredGameType>(['rock_paper_scissors'])

const GAME_LOBBIES_ROUTES: Record<LobbyRouteGameType, string> = {
  yahtzee: '/games/yahtzee/lobbies',
  guess_the_spy: '/games/spy/lobbies',
  tic_tac_toe: '/games/tic-tac-toe/lobbies',
  rock_paper_scissors: '/games/rock-paper-scissors/lobbies',
  memory: '/games/memory/lobbies',
  alias: '/games/alias/lobbies',
  liars_party: '/games/liars-party/lobbies',
}

export function isTemporarilyUnavailableGameType(
  gameType: string | null | undefined
): gameType is RegisteredGameType {
  return typeof gameType === 'string' && TEMPORARILY_UNAVAILABLE_GAME_TYPES.has(gameType as RegisteredGameType)
}

export function getGameLobbiesRoute(gameType: string | null | undefined): string | null {
  if (typeof gameType !== 'string') {
    return null
  }

  return GAME_LOBBIES_ROUTES[gameType as LobbyRouteGameType] ?? null
}

export function getPublicRegisteredGameTypes(): RegisteredGameType[] {
  return getAllRegisteredGameTypes().filter(
    (type) => !TEMPORARILY_UNAVAILABLE_GAME_TYPES.has(type)
  )
}

export function getLobbyCreateRoute(gameType: string | null | undefined): string | null {
  if (typeof gameType !== 'string' || !gameType) {
    return null
  }

  return `/lobby/create?gameType=${encodeURIComponent(gameType)}`
}
