import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { TelephoneDoodleGame, TelephoneDoodleGameData } from '@/lib/games/telephone-doodle-game'
import { Move } from '@/lib/game-engine'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import {
  telephoneDoodleActionRequestSchema,
  TelephoneDoodleDrawingPayload,
} from '@/lib/validation/telephone-doodle'

const limiter = rateLimit(rateLimitPresets.game)

function formatDrawingContent(payload: TelephoneDoodleDrawingPayload): string {
  return JSON.stringify({
    type: 'drawing',
    version: 1,
    width: payload.width,
    height: payload.height,
    strokes: payload.strokes,
  })
}

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

  const log = apiLogger('POST /api/game/[gameId]/telephone-doodle-action')

  try {
    const { gameId } = await params
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parsedBody = telephoneDoodleActionRequestSchema.safeParse(rawBody)
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
    if (resolvedGameType !== 'telephone_doodle') {
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

    const telephoneGame = new TelephoneDoodleGame(gameId)
    telephoneGame.restoreState(parsedState as any)

    const persistTelephoneState = async (
      nextState: ReturnType<TelephoneDoodleGame['getState']>,
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

      await appendGameReplaySnapshot({
        gameId,
        playerId: actingPlayerId ?? null,
        actionType,
        actionPayload,
        state: nextState,
      })

      if (game.lobby?.code) {
        if (emitActionEvent) {
          await notifySocket(`lobby:${game.lobby.code}`, 'telephone-doodle-action', {
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
    const timeoutResolution = telephoneGame.applyTimeoutFallback(turnTimerSeconds)
    const timeoutFallbackApplied = timeoutResolution.changed

    if (timeoutFallbackApplied) {
      log.info('Applied Telephone Doodle timeout fallback before action', {
        gameId,
        userId,
        turnTimerSeconds,
        timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
        phaseTransitions: timeoutResolution.phaseTransitions,
        revealAdvances: timeoutResolution.revealAdvances,
        autoSubmittedSteps: timeoutResolution.autoSubmittedSteps,
        autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
      })
    }

    const currentState = telephoneGame.getState()
    const gameData = currentState.data as TelephoneDoodleGameData

    let move: Move
    if (parsedBody.data.action === 'advance-reveal') {
      move = {
        playerId: userId,
        type: 'advance-reveal',
        data: {},
        timestamp: new Date(),
      }
    } else {
      const stepData = parsedBody.data.data
      const isDrawingPhase = gameData.phase === 'drawing'
      const hasDrawing = !!stepData.drawing
      const hasText = typeof stepData.content === 'string'

      if (isDrawingPhase && !hasDrawing) {
        return NextResponse.json(
          { error: 'Drawing payload is required during drawing phase' },
          { status: 400 }
        )
      }

      if (!isDrawingPhase && !hasText) {
        return NextResponse.json(
          { error: 'Text content is required for this phase' },
          { status: 400 }
        )
      }

      if (isDrawingPhase && hasText) {
        return NextResponse.json(
          { error: 'Text content is not allowed during drawing phase' },
          { status: 400 }
        )
      }

      if (!isDrawingPhase && hasDrawing) {
        return NextResponse.json(
          { error: 'Drawing payload is only allowed during drawing phase' },
          { status: 400 }
        )
      }

      const normalizedContent = hasDrawing
        ? formatDrawingContent(stepData.drawing as TelephoneDoodleDrawingPayload)
        : (stepData.content as string).trim()

      move = {
        playerId: userId,
        type: 'submit-step',
        data: {
          chainId: stepData.chainId,
          content: normalizedContent,
        },
        timestamp: new Date(),
      }
    }

    const moveAccepted = telephoneGame.makeMove(move)
    if (!moveAccepted) {
      if (timeoutFallbackApplied) {
        const stateAfterTimeout = telephoneGame.getState()
        await persistTelephoneState(
          stateAfterTimeout,
          'telephone_doodle:timeout-fallback',
          {
            timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
            autoSubmittedSteps: timeoutResolution.autoSubmittedSteps,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          },
          null,
          {
            action: 'timeout-fallback',
            playerId: null,
            data: {
              timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
              autoSubmittedSteps: timeoutResolution.autoSubmittedSteps,
              autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
            },
          }
        )

        return NextResponse.json(
          {
            error: 'Move expired due to timeout fallback',
            code: 'STEP_TIMEOUT_ADVANCED',
            state: stateAfterTimeout,
          },
          { status: 409 }
        )
      }

      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    const updatedState = telephoneGame.getState()
    await persistTelephoneState(
      updatedState,
      `telephone_doodle:${parsedBody.data.action}`,
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
            autoSubmittedSteps: timeoutResolution.autoSubmittedSteps,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          }
        : undefined,
    })
  } catch (error) {
    log.error('Error processing Telephone Doodle action', error as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
