type LobbyGameStatus = 'waiting' | 'playing' | 'finished'

interface LobbyGameLike {
  status?: string | null
  updatedAt?: Date | string | null
}

interface PickRelevantGameOptions {
  includeFinished?: boolean
}

export interface LobbySnapshotLike {
  lobby?: Record<string, any> | null
  activeGame?: Record<string, any> | null
  game?: Record<string, any> | null
}

export interface NormalizedLobbySnapshot {
  lobby: Record<string, any> | null
  activeGame: Record<string, any> | null
}

function getStatusPriority(status: string | null | undefined, includeFinished: boolean): number {
  switch (status) {
    case 'playing':
      return 3
    case 'waiting':
      return 2
    case 'finished':
      return includeFinished ? 1 : 0
    default:
      return 0
  }
}

export function pickRelevantLobbyGame<T extends LobbyGameLike>(
  games: T[] | null | undefined,
  options: PickRelevantGameOptions = {}
): T | null {
  if (!Array.isArray(games) || games.length === 0) {
    return null
  }

  const includeFinished = options.includeFinished === true

  const filtered = games.filter((game) => {
    const priority = getStatusPriority(game?.status, includeFinished)
    return priority > 0
  })

  if (filtered.length === 0) {
    return null
  }

  return [...filtered].sort((a, b) => {
    const aPriority = getStatusPriority(a?.status, includeFinished)
    const bPriority = getStatusPriority(b?.status, includeFinished)

    if (aPriority !== bPriority) {
      return bPriority - aPriority
    }

    const aUpdatedAt = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0
    const bUpdatedAt = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0
    return bUpdatedAt - aUpdatedAt
  })[0] || null
}

export function normalizeLobbySnapshotResponse(
  payload: LobbySnapshotLike | null | undefined,
  options: PickRelevantGameOptions = {}
): NormalizedLobbySnapshot {
  const lobby = (payload?.lobby || null) as Record<string, any> | null
  const activeGame =
    payload?.activeGame ||
    lobby?.activeGame ||
    payload?.game ||
    pickRelevantLobbyGame((lobby?.games as Record<string, any>[] | undefined) || [], options)

  return {
    lobby,
    activeGame: (activeGame || null) as Record<string, any> | null,
  }
}

export function isLobbyGameStatus(value: unknown): value is LobbyGameStatus {
  return value === 'waiting' || value === 'playing' || value === 'finished'
}
