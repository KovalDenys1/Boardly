import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { FakeArtistGame } from '@/lib/games/fake-artist-game'
import { Move, type RestorableGameState } from '@/lib/game-engine'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { fakeArtistActionRequestSchema } from '@/lib/validation/fake-artist'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { buildPartyGameTerminalUpdate } from '@/lib/game-persistence'
import { commitGameState, GameStateConflictError, type GameRowRevision } from '@/lib/game-state-lock'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'

const limiter = rateLimit(rateLimitPresets.game)

function resolveLastMoveAtDate(lastMoveAt: unknown): Date | undefined {
  if (typeof lastMoveAt === 'number' && Number.isFinite(lastMoveAt)) {
    return new Date(lastMoveAt)
  }
  return undefined
}

function resolveTurnTimerSeconds(turnTimer: unknown): number {
  if (typeof turnTimer !== 'number' || !Number.isFinite(turnTimer)) {
    return 0
  }
  return Math.max(0, Math.floor(turnTimer))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/fake-artist-action')

  try {
    const { gameId } = await params
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parsedBody = fakeArtistActionRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Invalid action payload',
          issues: parsedBody.error.issues,
        },
        { status: 400 }
      )
    }

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
        lobby: {
          select: {
            code: true,
            gameType: true,
            turnTimer: true,
            creatorId: true,
          },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const resolvedGameType = game.lobby?.gameType || game.gameType
    if (resolvedGameType !== 'fake_artist') {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    const player = game.players.find((entry) => entry.userId === userId)
    if (!player) {
      return NextResponse.json({ error: 'Player not in this game' }, { status: 403 })
    }

    if (
      (parsedBody.data.action === 'advance-phase' || parsedBody.data.action === 'advance-round') &&
      game.lobby?.creatorId &&
      game.lobby.creatorId !== userId
    ) {
      return NextResponse.json({ error: 'Only lobby host can advance this phase' }, { status: 403 })
    }

    let parsedState: RestorableGameState
    try {
      parsedState = parsePersistedGameState<RestorableGameState>(game.state)
    } catch {
      return NextResponse.json({ error: 'Corrupted game state' }, { status: 500 })
    }

    const fakeArtistGame = new FakeArtistGame(gameId)
    fakeArtistGame.restoreState(parsedState)
    const gamePlayersByUserId = new Map(
      game.players.map((entry) => [entry.userId, entry])
    )

    // #993: a party round has every player submitting into the same phase at
    // the same moment, so each write is conditioned on the revision it read and
    // the loser is told nothing landed instead of replaying its own snapshot
    // over the others. One request can persist twice (timeout fallback, then the
    // move), so the lock moves on with the row.
    let revision: GameRowRevision = { currentTurn: game.currentTurn, updatedAt: game.updatedAt }

    const persistFakeArtistState = async (
      nextState: ReturnType<FakeArtistGame['getState']>,
      actionType: string,
      actionPayload: Record<string, unknown> | undefined,
      actingPlayerId?: string | null,
      emitActionEvent?: {
        action: string
        playerId?: string | null
        data?: Record<string, unknown>
      }
    ) => {
      const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

      // #729: a transition into a terminal status must also write the
      // per-player isWinner/finalScore/placement fields stats derive from.
      const terminalUpdate = buildPartyGameTerminalUpdate({
        previousStatus: game.status,
        state: nextState,
        startedAt: game.startedAt,
        dbPlayers: game.players,
      })

      const committed = await commitGameState({
        gameId,
        revision,
        data: {
          state: toPersistedGameStateInput(nextState),
          status: nextState.status,
          ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
          ...(terminalUpdate ? terminalUpdate.terminalFields : {}),
        },
      })

      if (!committed) {
        throw new GameStateConflictError()
      }
      revision = committed

      if (terminalUpdate) {
        // The terminal diff supersedes the per-move score sync below — one
        // update per player carrying score + finalScore/placement/isWinner.
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
      } else {
        const scoreUpdates: Array<Promise<unknown>> = []
        const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
        for (const statePlayer of statePlayers) {
          if (!statePlayer || typeof statePlayer !== 'object') continue

          const playerId = (statePlayer as { id?: unknown }).id
          if (typeof playerId !== 'string') continue

          const dbPlayer = gamePlayersByUserId.get(playerId)
          if (!dbPlayer) continue

          const rawScore = (statePlayer as { score?: unknown }).score
          const nextScore =
            typeof rawScore === 'number' && Number.isFinite(rawScore)
              ? Math.floor(rawScore)
              : 0

          if (dbPlayer.score === nextScore) continue

          scoreUpdates.push(
            prisma.players.update({
              where: { id: dbPlayer.id },
              data: {
                score: nextScore,
              },
            })
          )
          dbPlayer.score = nextScore
        }

        if (scoreUpdates.length > 0) {
          await Promise.all(scoreUpdates)
        }
      }

      await appendGameReplaySnapshot({
        gameId,
        playerId: actingPlayerId ?? null,
        actionType,
        actionPayload,
        state: nextState,
      })

      if (game.lobby?.code) {
        if (emitActionEvent) {
          void broadcastToLobby(game.lobby.code, 'fake-artist-action', {
            action: emitActionEvent.action,
            playerId: emitActionEvent.playerId ?? null,
            data: emitActionEvent.data ?? {},
            state: nextState,
          })
        }

        void broadcastToLobby(game.lobby.code, 'game-update', {
          action: 'state-change',
          payload: { state: nextState },
        })
      }

      await checkAchievementsOnStatusChange(game.status, nextState.status, game.players, log)
    }

    const turnTimerSeconds = resolveTurnTimerSeconds(game.lobby?.turnTimer)
    const timeoutResolution = fakeArtistGame.applyTimeoutFallback(turnTimerSeconds)
    const timeoutFallbackApplied = timeoutResolution.changed

    if (timeoutFallbackApplied) {
      log.info('Applied Fake Artist timeout fallback before action', {
        gameId,
        userId,
        turnTimerSeconds,
        timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
        phaseTransitions: timeoutResolution.phaseTransitions,
        revealAdvances: timeoutResolution.revealAdvances,
        autoSubmittedStrokes: timeoutResolution.autoSubmittedStrokes,
        autoSubmittedVotes: timeoutResolution.autoSubmittedVotes,
        autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
      })
    }

    let move: Move
    if (parsedBody.data.action === 'advance-phase') {
      move = {
        playerId: userId,
        type: 'advance-phase',
        data: {},
        timestamp: new Date(),
      }
    } else if (parsedBody.data.action === 'advance-round') {
      move = {
        playerId: userId,
        type: 'advance-round',
        data: {},
        timestamp: new Date(),
      }
    } else if (parsedBody.data.action === 'submit-stroke') {
      move = {
        playerId: userId,
        type: 'submit-stroke',
        data: {
          content: parsedBody.data.data.content.trim(),
        },
        timestamp: new Date(),
      }
    } else {
      move = {
        playerId: userId,
        type: 'submit-vote',
        data: {
          suspectPlayerId: parsedBody.data.data.suspectPlayerId.trim(),
        },
        timestamp: new Date(),
      }
    }

    const moveAccepted = fakeArtistGame.makeMove(move)
    if (!moveAccepted) {
      if (timeoutFallbackApplied) {
        const stateAfterTimeout = fakeArtistGame.getState()
        await persistFakeArtistState(
          stateAfterTimeout,
          'fake_artist:timeout-fallback',
          {
            timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
            autoSubmittedStrokes: timeoutResolution.autoSubmittedStrokes,
            autoSubmittedVotes: timeoutResolution.autoSubmittedVotes,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          },
          null,
          {
            action: 'timeout-fallback',
            playerId: null,
            data: {
              timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
              autoSubmittedStrokes: timeoutResolution.autoSubmittedStrokes,
              autoSubmittedVotes: timeoutResolution.autoSubmittedVotes,
              autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
            },
          }
        )

        return NextResponse.json(
          {
            error: 'Move expired due to timeout fallback',
            code: 'ROUND_TIMEOUT_ADVANCED',
            state: stateAfterTimeout,
          },
          { status: 409 }
        )
      }

      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    const updatedState = fakeArtistGame.getState()
    await persistFakeArtistState(
      updatedState,
      `fake_artist:${parsedBody.data.action}`,
      move.data,
      userId,
      {
        action: parsedBody.data.action,
        playerId: userId,
        data: move.data,
      }
    )

    return NextResponse.json({
      success: true,
      state: updatedState,
      timeoutFallbackApplied,
      timeoutFallback: timeoutFallbackApplied
        ? {
            timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
            autoSubmittedStrokes: timeoutResolution.autoSubmittedStrokes,
            autoSubmittedVotes: timeoutResolution.autoSubmittedVotes,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          }
        : undefined,
    })
  } catch (error) {
    if (error instanceof GameStateConflictError) {
      return NextResponse.json(
        { error: 'Game state changed, please retry', code: 'STATE_CONFLICT' },
        { status: 409 }
      )
    }

    log.error('Error processing Fake Artist action', error as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
