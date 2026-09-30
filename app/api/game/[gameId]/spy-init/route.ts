import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { SpyGame, SpyGamePhase, sanitizeSpyStateForBroadcast } from '@/lib/games/spy-game'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getActiveSpyLocations } from '@/lib/spy-locations'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { commitGameState } from '@/lib/game-state-lock'
import type { Prisma } from '@/prisma/client'
import type { GameState } from '@/lib/game-engine'

const limiter = rateLimit(rateLimitPresets.game)

/** The read and one re-read after a lost race, as the leave path does (lib/lobby-leave.ts). */
const SPY_INIT_WRITE_ATTEMPTS = 2

/** The columns a round is dealt from and its write is conditioned on. */
interface SpyInitRow {
  state: Prisma.JsonValue
  status: string
  currentTurn: number
  updatedAt: Date
}

type SpyLocations = Awaited<ReturnType<typeof getActiveSpyLocations>>['locations']

/** Why this row cannot start a round, or null when it can. Checked again on every re-read. */
function roundStartError(row: SpyInitRow): string | null {
  const state = parsePersistedGameState<GameState>(row.state)
  const stateData = (state.data ?? {}) as {
    phase?: SpyGamePhase
    currentRound?: number
    totalRounds?: number
  }

  if (state.status === 'finished' || row.status === 'finished') {
    return 'Game already finished'
  }

  if (
    stateData.phase !== SpyGamePhase.WAITING &&
    stateData.phase !== SpyGamePhase.RESULTS
  ) {
    return 'Round can only be initialized from waiting/results phase'
  }

  if (
    stateData.phase === SpyGamePhase.RESULTS &&
    typeof stateData.currentRound === 'number' &&
    typeof stateData.totalRounds === 'number' &&
    stateData.currentRound >= stateData.totalRounds
  ) {
    return 'All rounds are already completed'
  }

  return null
}

/** Deals the next round (roles, location) onto this row's state. */
function dealRound(
  gameId: string,
  row: SpyInitRow,
  locations: SpyLocations
): { error: string } | { state: GameState } {
  const error = roundStartError(row)
  if (error) return { error }

  const spyGame = new SpyGame(gameId)
  spyGame.loadState(parsePersistedGameState(row.state))
  spyGame.initializeRound(locations)
  return { state: spyGame.getState() }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/spy-init')

  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { gameId } = await params

    // Fetch game
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
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

    // Only lobby creator can initialize round
    if (game.lobby.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Only lobby creator can initialize round' },
        { status: 403 }
      )
    }

    const startError = roundStartError(game)
    if (startError) {
      return NextResponse.json({ error: startError }, { status: 400 })
    }

    // Fetch locations from DB
    let activeLocations
    try {
      activeLocations = await getActiveSpyLocations()
    } catch (error) {
      log.error('Cannot initialize Spy round: failed to resolve locations', error as Error, {
        gameId,
      })
      return NextResponse.json(
        {
          error: 'Spy locations are not configured',
          details: error instanceof Error ? error.message : 'Unable to resolve Spy locations',
        },
        { status: 500 }
      )
    }

    if (activeLocations.source === 'fallback') {
      log.warn('No active Spy locations configured in DB, using fallback set', {
        gameId,
        fallbackCount: activeLocations.locations.length,
      })
    }

    // #1277: this used to save with a plain update on the primary key. A leave
    // that committed while the locations above were being fetched was then
    // written over with the snapshot read before it, so the departed player
    // was active again and could be dealt the spy. The write lands only on the
    // revision the round was dealt from; a lost race deals again from the row
    // that is actually there, the way the leave itself retries (lib/lobby-leave.ts).
    let row: SpyInitRow | null = game
    for (let attempt = 0; attempt < SPY_INIT_WRITE_ATTEMPTS; attempt += 1) {
      if (!row) {
        return NextResponse.json({ error: 'Game not found' }, { status: 404 })
      }

      const dealt = dealRound(gameId, row, activeLocations.locations)
      if ('error' in dealt) {
        return NextResponse.json({ error: dealt.error }, { status: 400 })
      }
      const updatedState = dealt.state

      // Check if status changed during initialization
      const statusChanged = row.status !== updatedState.status
      const oldStatus = row.status

      const committed = await commitGameState({
        gameId,
        revision: { currentTurn: row.currentTurn, updatedAt: row.updatedAt },
        data: {
          state: toPersistedGameStateInput(updatedState),
          status: updatedState.status, // Sync status from game engine
        },
      })

      if (!committed) {
        row = await prisma.games.findUnique({
          where: { id: gameId },
          select: { state: true, status: true, currentTurn: true, updatedAt: true },
        })
        continue
      }

      await appendGameReplaySnapshot({
        gameId,
        playerId: userId,
        actionType: 'spy:init-round',
        actionPayload: {
          source: activeLocations.source,
        },
        state: updatedState,
      })

      if (statusChanged) {
        log.info('Game status changed during round init', {
          gameId,
          oldStatus,
          newStatus: updatedState.status
        })
      } else {
        log.info('Spy game round initialized', { gameId })
      }

      // Never the raw state: it carries spyPlayerId, playerRoles and the location,
      // and this goes to every subscriber on the lobby topic. Each player reads
      // their own role from GET /api/game/[gameId]/spy-role instead.
      const broadcastState = sanitizeSpyStateForBroadcast(updatedState)

      void broadcastToLobby(game.lobby.code, 'spy-round-start', { state: broadcastState })
      void broadcastToLobby(game.lobby.code, 'game-update', {
        action: 'state-change',
        gameId: game.id,
        payload: { state: broadcastState },
      })

      return NextResponse.json({
        success: true,
        state: broadcastState,
      })
    }

    return NextResponse.json(
      { error: 'Game state changed, please retry', code: 'STATE_CONFLICT' },
      { status: 409 }
    )
  } catch (err) {
    log.error('Error initializing Spy round', err as Error)
    return NextResponse.json(
      { error: 'Failed to initialize round' },
      { status: 500 }
    )
  }
}
