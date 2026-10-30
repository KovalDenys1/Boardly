import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { createGameEngine, isSupportedGameType } from '@/lib/game-registry'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { extractCarriedGameConfig } from '@/lib/game-rules-carryover'
import { toPersistedGameType } from '@/lib/game-type-storage'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { verifyLobbyPassword } from '@/lib/lobby-password'
import { checkOpenLobbyLimit } from '@/lib/lobby-limit'
import { recordLobbyParticipation } from '@/lib/lobby-participation'
import { getSignupSourceFromRequest } from '@/lib/signup-source'
import { clearChatHistory } from '@/lib/chat-history'
import { isLobbyReopenable, lobbyReopenAgeBucket } from '@/lib/lobby-lifecycle'
import { onLobbyReopened } from '@/lib/lobby-reopen'

// The path carries the lobby code, so the budget is keyed on the route, and on the opener too.
const limiter = rateLimit({ ...rateLimitPresets.lobbyRematch, keyScope: 'lobby-reopen' })

const LIVE_GAME_STATUSES = ['waiting', 'playing'] as const

function refusal(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status })
}

async function readPassword(request: NextRequest): Promise<string | undefined> {
  try {
    const body = await request.json()
    return typeof body?.password === 'string' ? body.password : undefined
  } catch {
    return undefined
  }
}

/**
 * Reopens a closed table from its old invite link: the lobby keeps its game type, password
 * and kick list, gets one fresh waiting game with the opener seated, and the opener becomes
 * host unless they created it. Anyone else who follows the link afterwards joins through the
 * usual join routes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  const log = apiLogger('POST /api/lobby/[code]/reopen')

  try {
    const requestUser = await getRequestAuthUser(request)
    if (!requestUser?.id) {
      return refusal(401, 'UNAUTHORIZED', 'Unauthorized')
    }
    const userId = requestUser.id

    const identityLimitResult = await limiter(request, { identity: userId })
    if (identityLimitResult) return identityLimitResult

    const { code } = await params
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      // kickedUserIds is omitted globally (lib/db.ts); naming it in select brings it back.
      select: {
        id: true,
        code: true,
        password: true,
        isActive: true,
        gameType: true,
        kickedUserIds: true,
        createdAt: true,
        pseudonymisedAt: true,
        creatorId: true,
      },
    })

    if (!lobby) {
      return refusal(404, 'LOBBY_NOT_FOUND', 'Lobby not found')
    }

    if (!isLobbyReopenable({ createdAt: lobby.createdAt, pseudonymisedAt: lobby.pseudonymisedAt })) {
      return refusal(410, 'LOBBY_TOO_OLD', 'This table can no longer be reopened')
    }

    // Before the password, as on join: knowing the password is not a way back in.
    if (lobby.kickedUserIds.includes(userId)) {
      return refusal(403, 'KICKED_FROM_LOBBY', 'The host removed you from this lobby')
    }

    if (lobby.password) {
      const isPasswordValid = await verifyLobbyPassword(lobby.password, await readPassword(request))
      if (!isPasswordValid) {
        return refusal(403, 'INVALID_PASSWORD', 'Invalid password')
      }
    }

    const liveGame = await prisma.games.findFirst({
      where: { lobbyId: lobby.id, status: { in: [...LIVE_GAME_STATUSES] } },
      select: { id: true },
    })
    if (lobby.isActive || liveGame) {
      return refusal(409, 'LOBBY_NOT_CLOSED', 'This table is open')
    }

    const gameType = lobby.gameType
    // The same gate as creating a lobby: a game taken off the list or behind a flag is not reopened.
    if (!isSupportedGameType(gameType) || isTemporarilyUnavailableGameType(gameType)) {
      return refusal(410, 'GAME_TYPE_UNAVAILABLE', 'This game is not available right now')
    }

    const lastGame = await prisma.games.findFirst({
      where: { lobbyId: lobby.id },
      orderBy: { createdAt: 'desc' },
      select: { state: true },
    })
    const initialState = createGameEngine(
      gameType,
      'temp',
      lastGame ? extractCarriedGameConfig(gameType, lastGame.state) : undefined
    ).getState()

    const outcome = await prisma.$transaction(async (tx) => {
      // One open lobby per person (#907): the lock makes two reopens by one person take turns.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`open-lobby:${userId}`}))`
      const limit = await checkOpenLobbyLimit(userId, tx)
      if (limit.kind === 'blocked') return limit

      // Postgres re-checks `isActive = false` on the locked row, so of two reopens of one table only the first claims it.
      const claimed = await tx.lobbies.updateMany({
        where: { id: lobby.id, isActive: false },
        data: {
          isActive: true,
          spectatorCount: 0,
          ...(lobby.creatorId === userId ? {} : { creatorId: userId }),
        },
      })
      if (claimed.count === 0) return { kind: 'taken' as const }

      const game = await tx.games.create({
        data: {
          lobbyId: lobby.id,
          gameType: toPersistedGameType(gameType),
          status: 'waiting',
          state: toPersistedGameStateInput(initialState),
          players: {
            create: [{ userId, position: 0, scorecard: JSON.stringify({}) }],
          },
        },
        select: { id: true },
      })
      return { kind: 'reopened' as const, game }
    })

    if (outcome.kind === 'blocked') {
      return refusal(409, 'LOBBY_ALREADY_OPEN', 'You already have a game open', { lobbyCode: outcome.lobbyCode })
    }
    if (outcome.kind === 'taken') {
      return refusal(409, 'LOBBY_NOT_CLOSED', 'This table is open')
    }
    const reopenedGame = outcome.game

    await Promise.all([
      clearChatHistory(lobby.code),
      recordLobbyParticipation({
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        gameType: toPersistedGameType(gameType),
        userId,
        isGuest: requestUser.isGuest,
        signupSource: getSignupSourceFromRequest(request),
        countsAsJoin: false,
      }),
    ])

    await onLobbyReopened({
      lobbyId: lobby.id,
      lobbyCode: lobby.code,
      gameType,
      gameId: reopenedGame.id,
      reopenedBy: { userId, isGuest: requestUser.isGuest },
      ageBucket: lobbyReopenAgeBucket(lobby.createdAt),
    })

    // A page still open on the old result moves to the waiting room, as after "Back to lobby".
    await broadcastToLobby(lobby.code, 'game-reset', { lobbyCode: lobby.code, gameId: reopenedGame.id })

    log.info('Lobby reopened', { code: lobby.code, gameId: reopenedGame.id, hostChanged: lobby.creatorId !== userId })

    return NextResponse.json({ success: true, gameId: reopenedGame.id })
  } catch (error) {
    log.error('Failed to reopen lobby', error as Error)
    return refusal(500, 'LOBBY_REOPEN_FAILED', 'Failed to reopen the table')
  }
}
