import { trackLobbyCreateReady, type AnalyticsGameType } from '@/lib/analytics'
import { clientLogger } from '@/lib/client-logger'

interface PendingLobbyCreateMetric {
  lobbyCode: string
  gameType: AnalyticsGameType
  startedAt: number
  isGuest: boolean
}

const PENDING_LOBBY_CREATE_KEY = 'boardly.pendingLobbyCreateMetric.v1'
const PENDING_LOBBY_CREATE_TTL_MS = 10 * 60 * 1000

const ANALYTICS_GAME_TYPES = new Set<AnalyticsGameType>([
  'yahtzee',
  'tic_tac_toe',
  'rock_paper_scissors',
  'guess_the_spy',
])

function normalizeGameType(value: unknown, fallback: AnalyticsGameType = 'yahtzee'): AnalyticsGameType {
  if (typeof value === 'string' && ANALYTICS_GAME_TYPES.has(value as AnalyticsGameType)) {
    return value as AnalyticsGameType
  }
  return fallback
}

function readPendingMetric(): PendingLobbyCreateMetric | null {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.sessionStorage.getItem(PENDING_LOBBY_CREATE_KEY)
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
      window.sessionStorage.removeItem(PENDING_LOBBY_CREATE_KEY)
      return null
    }

    return {
      lobbyCode: parsed.lobbyCode,
      gameType: normalizeGameType(parsed.gameType),
      startedAt: parsed.startedAt,
      isGuest: parsed.isGuest,
    }
  } catch {
    window.sessionStorage.removeItem(PENDING_LOBBY_CREATE_KEY)
    return null
  }
}

export function markPendingLobbyCreateMetric(metric: PendingLobbyCreateMetric): void {
  if (typeof window === 'undefined') {
    return
  }

  window.sessionStorage.setItem(
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
    window.sessionStorage.removeItem(PENDING_LOBBY_CREATE_KEY)
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

  window.sessionStorage.removeItem(PENDING_LOBBY_CREATE_KEY)

  clientLogger.log('📊 Analytics: Lobby create ready tracked', {
    lobbyCode: params.lobbyCode,
    gameType: resolvedGameType,
    durationMs,
    isGuest: pending.isGuest,
  })

  return true
}
