export interface LobbyFilterOptions {
  gameType?: string
  status?: 'all' | 'waiting' | 'playing'
  search?: string
  minPlayers?: number
  maxPlayers?: number
  sortBy?: 'createdAt' | 'playerCount' | 'name'
  sortOrder?: 'asc' | 'desc'
}

const FILTERABLE_GAME_TYPES = new Set([
  'yahtzee',
  'guess_the_spy',
  'tic_tac_toe',
  'rock_paper_scissors',
])

export const LOBBY_CODE_LENGTH = 4
const LOBBY_CODE_SANITIZE_PATTERN = /[^A-Z0-9]/g

export function normalizeGameTypeFilter(value: string | null): string | undefined {
  if (!value) return undefined
  return FILTERABLE_GAME_TYPES.has(value) ? value : undefined
}

export function sanitizeLobbyCode(value: string): string {
  return value.toUpperCase().replace(LOBBY_CODE_SANITIZE_PATTERN, '').slice(0, LOBBY_CODE_LENGTH)
}

export function buildLobbyQueryParams(filters: LobbyFilterOptions): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.gameType) params.append('gameType', filters.gameType)
  if (filters.status && filters.status !== 'all') params.append('status', filters.status)
  if (filters.search) params.append('search', filters.search)
  if (filters.minPlayers) params.append('minPlayers', filters.minPlayers.toString())
  if (filters.maxPlayers) params.append('maxPlayers', filters.maxPlayers.toString())
  if (filters.sortBy) params.append('sortBy', filters.sortBy)
  if (filters.sortOrder) params.append('sortOrder', filters.sortOrder)
  return params
}

export function hasActiveLobbyFilters(filters: LobbyFilterOptions): boolean {
  return Boolean(
    filters.gameType ||
      filters.status !== 'all' ||
      filters.search ||
      filters.minPlayers ||
      filters.maxPlayers
  )
}
