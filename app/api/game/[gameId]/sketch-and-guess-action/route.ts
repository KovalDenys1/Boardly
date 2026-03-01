import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { Move } from '@/lib/game-engine'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { sketchAndGuessActionRequestSchema } from '@/lib/validation/sketch-and-guess'

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

  const log = apiLogger('POST /api/game/[gameId]/sketch-and-guess-action')

  try {
    const { gameId } = await params
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parsedBody = sketchAndGuessActionRequestSchema.safeParse(rawBody)
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
          },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const resolvedGameType = game.lobby?.gameType || game.gameType
    if (resolvedGameType !== 'sketch_and_guess') {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    const player = game.players.find((entry) => entry.userId === userId)
    if (!player) {
      return NextResponse.json({ error: 'Player not in this game' }, { status: 403 })
    }

    let parsedState: unknown
    try {
      parsedState = JSON.parse(game.state)
    } catch {
      return NextResponse.json({ error: 'Corrupted game state' }, { status: 500 })
    }

    const sketchGame = new SketchAndGuessGame(gameId)
    sketchGame.restoreState(parsedState as any)

    const gamePlayersByUserId = new Map(
      game.players.map((entry) => [entry.userId, entry])
    )

    const persistSketchState = async (
      nextState: ReturnType<SketchAndGuessGame['getState']>,
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

      await prisma.games.update({
        where: { id: gameId },
        data: {
          state: JSON.stringify(nextState),
          status: nextState.status,
          ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
          updatedAt: new Date(),
        },
      })

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

      await appendGameReplaySnapshot({
        gameId,
        playerId: actingPlayerId ?? null,
        actionType,
        actionPayload,
        state: nextState,
      })

      if (game.lobby?.code) {
        if (emitActionEvent) {
          await notifySocket(`lobby:${game.lobby.code}`, 'sketch-and-guess-action', {
            action: emitActionEvent.action,
            playerId: emitActionEvent.playerId ?? null,
            data: emitActionEvent.data ?? {},
            state: nextState,
          })
        }

        await notifySocket(`lobby:${game.lobby.code}`, 'game-update', {
          action: 'state-change',
          payload: { state: nextState },
        })
      }
    }

    const turnTimerSeconds = resolveTurnTimerSeconds(game.lobby?.turnTimer)
    const timeoutResolution = sketchGame.applyTimeoutFallback(turnTimerSeconds)
    const timeoutFallbackApplied = timeoutResolution.changed

    if (timeoutFallbackApplied) {
      log.info('Applied Sketch & Guess timeout fallback before action', {
        gameId,
        userId,
        turnTimerSeconds,
        timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
        phaseTransitions: timeoutResolution.phaseTransitions,
        revealAdvances: timeoutResolution.revealAdvances,
        autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
        autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
        autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
      })
    }

    let move: Move
    if (parsedBody.data.action === 'advance-round') {
      move = {
        playerId: userId,
        type: 'advance-round',
        data: {},
        timestamp: new Date(),
      }
    } else if (parsedBody.data.action === 'submit-drawing') {
      move = {
        playerId: userId,
        type: 'submit-drawing',
        data: {
          content: parsedBody.data.data.content.trim(),
        },
        timestamp: new Date(),
      }
    } else {
      move = {
        playerId: userId,
        type: 'submit-guess',
        data: {
          guess: parsedBody.data.data.guess.trim(),
        },
        timestamp: new Date(),
      }
    }

    const moveAccepted = sketchGame.makeMove(move)
    if (!moveAccepted) {
      if (timeoutFallbackApplied) {
        const stateAfterTimeout = sketchGame.getState()
        await persistSketchState(
          stateAfterTimeout,
          'sketch_and_guess:timeout-fallback',
          {
            timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
            autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
            autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          },
          null,
          {
            action: 'timeout-fallback',
            playerId: null,
            data: {
              timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
              autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
              autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
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

    const updatedState = sketchGame.getState()
    await persistSketchState(
      updatedState,
      `sketch_and_guess:${parsedBody.data.action}`,
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
            autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
            autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          }
        : undefined,
    })
  } catch (error) {
    log.error('Error processing Sketch & Guess action', error as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
