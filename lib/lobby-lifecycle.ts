const TERMINAL_GAME_STATUSES = ['abandoned', 'cancelled'] as const
const NON_TERMINAL_ACTIVE_STATUSES = new Set(['waiting', 'playing'])
const NON_TERMINAL_SETTLED_STATUSES = new Set(['finished'])

export type TerminalGameStatus = (typeof TERMINAL_GAME_STATUSES)[number]

export function isTerminalGameStatus(value: unknown): value is TerminalGameStatus {
  return value === 'abandoned' || value === 'cancelled'
}

/** How long after its creation a closed lobby's link can still reopen it. */
export const LOBBY_REOPEN_WINDOW_DAYS = 30

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

type DateLike = Date | string | number | null | undefined

function toTime(value: DateLike): number | null {
  if (value === null || value === undefined) return null
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : null
}

/** A lobby keeps its link for 30 days, and never once the retention rule has renamed it. */
export function isLobbyReopenable(params: {
  createdAt: DateLike
  pseudonymisedAt: DateLike
  now?: number
}): boolean {
  if (params.pseudonymisedAt) return false
  const createdAt = toTime(params.createdAt)
  if (createdAt === null) return false
  const now = params.now ?? Date.now()
  return now - createdAt < LOBBY_REOPEN_WINDOW_DAYS * DAY_MS
}

export type ClosedLobbyOutcome = 'reopen' | 'start_new'

/**
 * What opening the link of a closed lobby leads to: the reopen panel, or a new table when the
 * lobby is past its window or its game is no longer available. Null for a lobby that is not
 * closed – active, or still holding a waiting or playing game – which keeps today's routing.
 */
export function resolveClosedLobbyOutcome(params: {
  gameStatus: unknown
  lobbyIsActive: unknown
  createdAt: DateLike
  pseudonymisedAt: DateLike
  gameAvailable?: boolean
  now?: number
}): ClosedLobbyOutcome | null {
  if (params.lobbyIsActive !== false) return null
  if (typeof params.gameStatus === 'string' && NON_TERMINAL_ACTIVE_STATUSES.has(params.gameStatus)) {
    return null
  }
  return params.gameAvailable !== false && isLobbyReopenable(params) ? 'reopen' : 'start_new'
}

export type LobbyReopenAgeBucket = 'under_1h' | '1h_to_3h' | '3h_to_24h' | '1d_to_7d' | '7d_to_30d'

export function lobbyReopenAgeBucket(createdAt: DateLike, now: number = Date.now()): LobbyReopenAgeBucket {
  const age = now - (toTime(createdAt) ?? now)
  if (age < HOUR_MS) return 'under_1h'
  if (age < 3 * HOUR_MS) return '1h_to_3h'
  if (age < DAY_MS) return '3h_to_24h'
  if (age < 7 * DAY_MS) return '1d_to_7d'
  return '7d_to_30d'
}

export function resolveLifecycleRedirectReason(params: {
  gameStatus: unknown
  lobbyIsActive: unknown
}): string | null {
  const { gameStatus, lobbyIsActive } = params
  const normalizedGameStatus =
    typeof gameStatus === 'string' && gameStatus.trim().length > 0 ? gameStatus : null

  if (isTerminalGameStatus(normalizedGameStatus)) {
    return `local-game-status:${normalizedGameStatus}`
  }

  if (
    lobbyIsActive === false &&
    !NON_TERMINAL_ACTIVE_STATUSES.has(normalizedGameStatus || '') &&
    !NON_TERMINAL_SETTLED_STATUSES.has(normalizedGameStatus || '')
  ) {
    return 'local-lobby-inactive'
  }

  return null
}
