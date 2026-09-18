import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { SpyGame, sanitizeSpyStateForBroadcast } from '@/lib/games/spy-game'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { buildPartyGameTerminalUpdate } from '@/lib/game-persistence'
import { commitGameState, GameStateConflictError } from '@/lib/game-state-lock'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'

const spyActionSchema = z.object({
  action: z.enum([
    'player-ready',
    'ask-question',
    'answer-question',
    'skip-turn',
    'start-voting',
    'vote',
    'spy-guess-location',
  ]),
  data: z.record(z.unknown()).optional(),
})

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/spy-action')

  try {
    const { gameId } = await params

    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id
    const username = requestUser?.username || 'Guest'

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = spyActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action', details: parsed.error.flatten() }, { status: 400 })
    }
    const { action, data } = parsed.data

    // Fetch game
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                bot: true,
              },
            },
          },
        },
        lobby: true,
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const resolvedGameType = game.lobby?.gameType || game.gameType
    if (resolvedGameType !== 'guess_the_spy') {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    // Verify player is in this game
    const player = game.players.find((p) => p.userId === userId)
    if (!player) {
      return NextResponse.json({ error: 'Player not in this game' }, { status: 403 })
    }

    // Creator-only actions: verify against DB, not client payload
    if (action === 'start-voting' && game.lobby.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Only the lobby creator can start voting early' },
        { status: 403 }
      )
    }

    // Load game engine
    const spyGame = new SpyGame(gameId)
    spyGame.loadState(parsePersistedGameState(game.state))

    // Build move object
    const move = {
      playerId: userId,
      type: action,
      data: data || {},
      timestamp: new Date(),
    }

    // Validate + process through engine so win-condition/status updates are applied.
    const moveAccepted = spyGame.makeMove(move)
    if (!moveAccepted) {
      log.warn('Invalid Spy game move', { userId, action, gameId })
      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    // Get updated state
    const updatedState = spyGame.getState()
    const lastMoveAtDate = typeof updatedState.lastMoveAt === 'number' && Number.isFinite(updatedState.lastMoveAt)
      ? new Date(updatedState.lastMoveAt)
      : undefined

    // Check if game status changed (e.g., finished)
    const statusChanged = game.status !== updatedState.status
    const oldStatus = game.status

    // #729: a transition into a terminal status must also write the
    // per-player isWinner/finalScore/placement fields stats derive from.
    const terminalUpdate = buildPartyGameTerminalUpdate({
      previousStatus: game.status,
      state: updatedState,
      startedAt: game.startedAt,
      dbPlayers: game.players,
    })

    // Update game in database - CRITICAL: include status from engine.
    // #993: ready-ups and votes all land in the same phase at the same moment,
    // so this write has to lose to whoever committed first rather than replay
    // its own snapshot over their submission.
    const committed = await commitGameState({
      gameId,
      revision: { currentTurn: game.currentTurn, updatedAt: game.updatedAt },
      data: {
        state: toPersistedGameStateInput(updatedState),
        status: updatedState.status, // Sync status from game engine
        ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
        ...(terminalUpdate ? terminalUpdate.terminalFields : {}),
      },
    })

    if (!committed) {
      throw new GameStateConflictError()
    }

    if (terminalUpdate) {
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

    await appendGameReplaySnapshot({
      gameId,
      playerId: userId,
      actionType: `spy:${action}`,
      actionPayload: data,
      state: updatedState,
    })

    // Log state transitions for debugging
    if (statusChanged) {
      log.info('Game status changed', {
        gameId,
        userId,
        action,
        oldStatus,
        newStatus: updatedState.status,
        winner: updatedState.winner
      })
    } else {
      log.info('Spy game action processed', { userId, action, gameId })
    }

    await checkAchievementsOnStatusChange(game.status, updatedState.status, game.players, log)

    const broadcastState = sanitizeSpyStateForBroadcast(updatedState)

    void broadcastToLobby(game.lobby.code, 'spy-action', {
      action,
      playerId: userId,
      playerName: username,
      data,
      state: broadcastState,
    })
    void broadcastToLobby(game.lobby.code, 'game-update', {
      action: 'spy-action',
      payload: { state: broadcastState },
    })

    return NextResponse.json({
      success: true,
      state: broadcastState,
    })
  } catch (err) {
    if (err instanceof GameStateConflictError) {
      return NextResponse.json(
        { error: 'Game state changed, please retry', code: 'STATE_CONFLICT' },
        { status: 409 }
      )
    }

    log.error('Error processing Spy game action', err as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
