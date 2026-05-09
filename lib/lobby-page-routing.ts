export type DedicatedLobbyPageGameType =
  | 'tic_tac_toe'
  | 'rock_paper_scissors'
  | 'alias'
  | 'liars_party'
  | 'connect_four'

const DEDICATED_LOBBY_PAGE_GAME_TYPES = new Set<string>([
  'tic_tac_toe',
  'rock_paper_scissors',
  'alias',
  'liars_party',
  'connect_four',
])

const DEDICATED_LOBBY_PAGE_STATUSES = new Set<string>(['playing', 'finished'])

export function resolveDedicatedLobbyPageGameType(
  gameType: string | null | undefined,
  gameStatus: string | null | undefined,
): DedicatedLobbyPageGameType | null {
  if (!gameType || !DEDICATED_LOBBY_PAGE_GAME_TYPES.has(gameType)) {
    return null
  }

  if (!gameStatus || !DEDICATED_LOBBY_PAGE_STATUSES.has(gameStatus)) {
    return null
  }

  return gameType as DedicatedLobbyPageGameType
}
