import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { LOBBY_WITH_GAMES_FOR_LEAVE_INCLUDE, performPlayerLeave } from '@/lib/lobby-leave'

/**
 * A client heartbeats every ~10s (see hooks/useLobbyHeartbeat.ts). 3x that
 * interval gives headroom for network jitter or one missed beat before
 * treating someone as disconnected, while still recovering vastly faster
 * than the ~2h stale-lobby-cleanup-cron this replaces for the common case
 * of a closed tab (#675).
 */
export const HEARTBEAT_STALE_THRESHOLD_MS = 30_000

interface SweepablePlayer {
  userId: string
  leftAt: Date | null
  lastHeartbeatAt: Date
  user: { bot: unknown }
}

interface SweepableGame {
  id: string
  players: SweepablePlayer[]
}

export interface SweepStalePlayersResult {
  removedUserIds: string[]
  /** True if removing a stale player abandoned/deactivated `game` itself — callers should treat it as no longer 'playing' without re-fetching. */
  gameAbandoned: boolean
}

/**
 * Opportunistic zero-signal disconnect detection. No separate cron: this is
 * called from GET /api/lobby/[code] so it piggybacks on requests other
 * players (or the departed player's own reconnect attempts) are already
 * making — the same "lazy check on read" pattern this file's neighbors
 * already use for per-game-type turn-timeout fallbacks.
 *
 * `game` only needs to carry each player's userId/leftAt/lastHeartbeatAt/
 * bot-ness — callers that already loaded this (e.g. the lobby GET route's
 * `include`d players) pass it straight through with no extra query. Only
 * once a stale player is actually found does this do the heavier
 * LOBBY_WITH_GAMES_FOR_LEAVE_INCLUDE fetch performPlayerLeave needs.
 */
export async function sweepStalePlayers(
  game: SweepableGame,
  code: string,
  log: ReturnType<typeof apiLogger>,
  options: { presentUserId?: string | null } = {}
): Promise<SweepStalePlayersResult> {
  const cutoff = Date.now() - HEARTBEAT_STALE_THRESHOLD_MS
  const staleIds = game.players
    .filter((p) => p.leftAt === null && !p.user.bot && p.lastHeartbeatAt.getTime() < cutoff)
    .map((p) => p.userId)

  // A tab back from the background reads the lobby before its throttled heartbeat lands.
  const presentUserId = options.presentUserId ?? null
  if (presentUserId && staleIds.includes(presentUserId)) {
    try {
      await prisma.players.updateMany({
        where: { gameId: game.id, userId: presentUserId, leftAt: null },
        data: { lastHeartbeatAt: new Date() },
      })
    } catch (error) {
      log.warn('Failed to refresh the reading player\'s heartbeat', { code, userId: presentUserId, error })
    }
  }
  const stalePlayerIds = staleIds.filter((userId) => userId !== presentUserId)

  if (stalePlayerIds.length === 0) {
    return { removedUserIds: [], gameAbandoned: false }
  }

  const removedUserIds: string[] = []
  let gameAbandoned = false

  for (const userId of stalePlayerIds) {
    try {
      const lobby = await prisma.lobbies.findUnique({
        where: { code },
        include: LOBBY_WITH_GAMES_FOR_LEAVE_INCLUDE,
      })
      if (!lobby) break

      const stillInGame = lobby.games.some((g) =>
        g.id === game.id && g.players.some((p) => p.userId === userId && p.leftAt === null)
      )
      if (!stillInGame) continue // already handled by a concurrent sweep/explicit leave

      const result = await performPlayerLeave(lobby, code, userId, log)
      removedUserIds.push(userId)
      if (result.body.gameAbandoned || result.body.lobbyDeactivated) {
        gameAbandoned = true
      }
      log.info('Swept stale (heartbeat-timed-out) player from lobby', {
        code,
        userId,
        gameId: game.id,
      })
    } catch (error) {
      log.warn('Failed to sweep stale player', { code, userId, error })
    }
  }

  return { removedUserIds, gameAbandoned }
}
