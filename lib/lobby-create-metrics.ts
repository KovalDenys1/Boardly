import { trackLobbyCreateReady } from '@/lib/analytics'
import { toAnalyticsGameType, type AnalyticsGameType } from '@/lib/analytics-game-types'
import { clientLogger } from '@/lib/client-logger'
import { readSession, removeSession, writeSession } from '@/lib/safe-storage'

interface PendingLobbyCreateMetric {
  lobbyCode: string
  gameType: AnalyticsGameType
  startedAt: number
  isGuest: boolean
}

const PENDING_LOBBY_CREATE_KEY = 'boardly.pendingLobbyCreateMetric.v1'
const PENDING_LOBBY_CREATE_TTL_MS = 10 * 60 * 1000

// The list this used to keep locally went stale: it never gained `sketch_and_guess`,
// so that game was silently recorded as Yahtzee. Narrow through the helper that lives
// beside the union instead, so a new game can only ever be added in one place (#1044).
function normalizeGameType(value: unknown, fallback: AnalyticsGameType = 'yahtzee'): AnalyticsGameType {
  return toAnalyticsGameType(value) ?? fallback
}

function readPendingMetric(): PendingLobbyCreateMetric | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = readSession(PENDING_LOBBY_CREATE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingLobbyCreateMetric>
    if (
      typeof parsed.lobbyCode !== 'string' ||
      typeof parsed.startedAt !== 'number' ||
      typeof parsed.isGuest !== 'boolean'
    ) {
      removeSession(PENDING_LOBBY_CREATE_KEY)
      return null
    }

    return {
      lobbyCode: parsed.lobbyCode,
      gameType: normalizeGameType(parsed.gameType),
      startedAt: parsed.startedAt,
      isGuest: parsed.isGuest,
    }
  } catch {
    removeSession(PENDING_LOBBY_CREATE_KEY)
    return null
  }
}

export function markPendingLobbyCreateMetric(metric: PendingLobbyCreateMetric): void {
  if (typeof window === 'undefined') {
    return
  }

  writeSession(
    PENDING_LOBBY_CREATE_KEY,
    JSON.stringify({
      lobbyCode: metric.lobbyCode,
      gameType: normalizeGameType(metric.gameType),
      startedAt: metric.startedAt,
      isGuest: metric.isGuest,
    })
  )
}

export function finalizePendingLobbyCreateMetric(params: {
  lobbyCode: string
  fallbackGameType?: string | null
}): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  const pending = readPendingMetric()
  if (!pending) {
    return false
  }

  const now = Date.now()
  const isStale = now - pending.startedAt > PENDING_LOBBY_CREATE_TTL_MS
  if (isStale) {
    removeSession(PENDING_LOBBY_CREATE_KEY)
    return false
  }

  if (pending.lobbyCode !== params.lobbyCode) {
    return false
  }

  const durationMs = Math.max(0, now - pending.startedAt)
  const resolvedGameType = normalizeGameType(params.fallbackGameType, pending.gameType)

  trackLobbyCreateReady({
    gameType: resolvedGameType,
    durationMs,
    isGuest: pending.isGuest,
  })

  removeSession(PENDING_LOBBY_CREATE_KEY)

  clientLogger.log('📊 Analytics: Lobby create ready tracked', {
    lobbyCode: params.lobbyCode,
    gameType: resolvedGameType,
    durationMs,
    isGuest: pending.isGuest,
  })

  return true
}
