import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { broadcastToLobby } from '@/lib/supabase-server'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { buildPartyGameTerminalUpdate, type DbPlayerRecord } from '@/lib/game-persistence'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'

function resolveLastMoveAtDate(lastMoveAt: unknown): Date | undefined {
  if (typeof lastMoveAt === 'number' && Number.isFinite(lastMoveAt)) {
    return new Date(lastMoveAt)
  }
  return undefined
}

export type TimeoutActiveGame = {
  id: string
  updatedAt: Date
  state: unknown
  status: string
  startedAt?: Date | null
  lastMoveAt?: Date | null
  players: unknown
}

export async function commitTimeoutFallback(params: {
  activeGame: TimeoutActiveGame
  nextState: { status: string; winner?: string | null; lastMoveAt?: unknown; players?: unknown[]; data?: unknown }
  actionType: string
  actionPayload: Record<string, unknown>
  lobbyCode: string
  gameType: string
  gameSocketEvent?: string
  gameSocketData?: Record<string, unknown>
  /** Which request applied the clock, for the replay record. */
  source?: 'lobby-get' | 'move'
}): Promise<boolean> {
  const { activeGame, nextState, actionType, actionPayload, lobbyCode, gameType, gameSocketEvent, gameSocketData, source = 'lobby-get' } = params
  const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)
  // Captured before activeGame.status is mutated below — the achievement
  // gate needs the pre-write status to detect the transition into 'finished'.
  const previousStatus = activeGame.status

  // #729: a timeout fallback can be the write that transitions one of the
  // party games into 'finished' — it must set the terminal player fields too.
  const fallbackDbPlayers: DbPlayerRecord[] = (Array.isArray(activeGame.players) ? activeGame.players as Record<string, unknown>[] : [])
    .map((entry) => ({
      id: typeof entry?.id === 'string' ? entry.id : '',
      userId: typeof entry?.userId === 'string' ? entry.userId : '',
      score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
      scorecard: typeof entry?.scorecard === 'string' ? entry.scorecard : null,
      finalScore: typeof entry?.finalScore === 'number' ? entry.finalScore : null,
      placement: typeof entry?.placement === 'number' ? entry.placement : null,
      isWinner: entry?.isWinner === true,
    }))
    .filter((entry) => entry.id.length > 0 && entry.userId.length > 0)
  const terminalUpdate = buildPartyGameTerminalUpdate({
    previousStatus: activeGame.status,
    state: nextState,
    startedAt: activeGame.startedAt ?? null,
    dbPlayers: fallbackDbPlayers,
  })

  const writtenAt = new Date()
  const updateResult = await prisma.games.updateMany({
    where: { id: activeGame.id, updatedAt: activeGame.updatedAt },
    data: {
      state: toPersistedGameStateInput(nextState),
      status: nextState.status as 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled',
      ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
      ...(terminalUpdate ? terminalUpdate.terminalFields : {}),
      updatedAt: writtenAt,
    },
  })

  if (updateResult.count === 0) return false
  // So a second write in the same request (Sketch & Guess's hint lock) is
  // conditioned on this row, not the one read before it.
  activeGame.updatedAt = writtenAt

  if (terminalUpdate) {
    // The terminal diff supersedes the plain score sync below — one update per
    // player carrying score + finalScore/placement/isWinner.
    await Promise.all(terminalUpdate.changedPlayerUpdates.map((update) =>
      prisma.players.update({
        where: { id: update.id },
        data: {
          score: update.score,
          scorecard: update.scorecard,
          finalScore: update.finalScore,
          placement: update.placement,
          isWinner: update.isWinner,
        },
      })
    ))
  }

  if (!terminalUpdate) {
    const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
    const activePlayersByUserId = new Map(fallbackDbPlayers.map((p) => [p.userId, p]))

    const scoreUpdates: Array<Promise<unknown>> = []
    for (const statePlayer of statePlayers) {
      if (!statePlayer || typeof statePlayer !== 'object') continue
      const statePlayerId = (statePlayer as { id?: unknown }).id
      if (typeof statePlayerId !== 'string') continue
      const dbPlayer = activePlayersByUserId.get(statePlayerId)
      if (!dbPlayer) continue
      const rawScore = (statePlayer as { score?: unknown }).score
      const nextScore = typeof rawScore === 'number' && Number.isFinite(rawScore) ? Math.floor(rawScore) : 0
      if (dbPlayer.score === nextScore) continue
      scoreUpdates.push(prisma.players.update({ where: { id: dbPlayer.id }, data: { score: nextScore } }))
      dbPlayer.score = nextScore
    }
    if (scoreUpdates.length > 0) await Promise.all(scoreUpdates)
  }

  // #759: the timeout fallback can be the write that finishes a game — it
  // previously ran terminal player fields (#729) but never achievement
  // checks, silently skipping unlocks for games ended by idle timeout.
  await checkAchievementsOnStatusChange(
    previousStatus,
    nextState.status,
    (Array.isArray(activeGame.players) ? activeGame.players as Array<Record<string, unknown>> : [])
      .filter((entry): entry is Record<string, unknown> & { userId: string } => typeof entry?.userId === 'string')
      .map((entry) => ({ userId: entry.userId, user: entry.user })),
    apiLogger(source === 'move' ? 'POST /api/game/[gameId]/state' : 'GET /api/lobby/[code]')
  )

  activeGame.state = JSON.stringify(nextState)
  activeGame.status = nextState.status
  if (lastMoveAtDate) activeGame.lastMoveAt = lastMoveAtDate

  await appendGameReplaySnapshot({
    gameId: activeGame.id,
    playerId: null,
    actionType,
    actionPayload: { source, ...actionPayload },
    state: nextState,
  })

  // No single viewer for a shared broadcast — strip any per-game hidden info
  // (e.g. Sketch & Guess's live prompt) for everyone. `nextState` itself
  // (used for persistence/replay above) is deliberately left untouched.
  const broadcastState = sanitizeStateForBroadcast(gameType, nextState, null)

  if (gameSocketEvent && gameSocketData) {
    void broadcastToLobby(lobbyCode, gameSocketEvent, {
      action: 'timeout-fallback',
      playerId: null,
      data: gameSocketData,
      state: broadcastState,
    })
  }

  void broadcastToLobby(lobbyCode, 'game-update', {
    action: 'state-change',
    gameId: activeGame.id,
    payload: { state: broadcastState },
  })
  return true
}
