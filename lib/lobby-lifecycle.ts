const TERMINAL_GAME_STATUSES = ['abandoned', 'cancelled'] as const
const NON_TERMINAL_ACTIVE_STATUSES = new Set(['waiting', 'playing'])
const NON_TERMINAL_SETTLED_STATUSES = new Set(['finished'])

export type TerminalGameStatus = (typeof TERMINAL_GAME_STATUSES)[number]

export function isTerminalGameStatus(value: unknown): value is TerminalGameStatus {
  return value === 'abandoned' || value === 'cancelled'
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
