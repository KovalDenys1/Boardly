import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { RockPaperScissorsGame } from '@/lib/games/rock-paper-scissors-game'
import { Move, Player } from '@/lib/game-engine'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { advanceTurnPastDisconnectedPlayers } from '@/lib/disconnected-turn'
import { notifySocket } from '@/lib/socket-url'

interface AutoActionContext {
  source: 'turn-timeout'
  debounceKey: string
  turnSnapshot: {
    currentPlayerId: string
    currentPlayerIndex: number
    lastMoveAt: number | null
    rollsLeft: number
    updatedAt: string | number | null
  }
}

const autoActionDebounceMap = new Map<string, number>()
const AUTO_ACTION_DEBOUNCE_MS = 2000
const AUTO_ACTION_DEBOUNCE_TTL_MS = 60000

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }
  return null
}

function resolveTurnTimerMs(turnTimer: unknown): number {
  if (typeof turnTimer !== 'number' || !Number.isFinite(turnTimer)) return 0
  if (turnTimer <= 0) return 0
  return Math.max(0, Math.floor(turnTimer * 1000))
}

function resolveLastMoveAtMs(stateLastMoveAt: unknown, fallback?: Date | null): number | null {
  const stateTimestamp = normalizeTimestamp(stateLastMoveAt)
  if (stateTimestamp !== null) return stateTimestamp
  if (fallback instanceof Date) {
    const fallbackTimestamp = fallback.getTime()
    return Number.isNaN(fallbackTimestamp) ? null : fallbackTimestamp
  }
  return null
}

function resolveLastMoveAtDate(stateLastMoveAt: unknown): Date | undefined {
  const timestamp = normalizeTimestamp(stateLastMoveAt)
  if (timestamp === null) return undefined
  return new Date(timestamp)
}

function shouldDebounceAutoAction(key: string): boolean {
  const now = Date.now()
  const previous = autoActionDebounceMap.get(key)

  if (previous && now - previous < AUTO_ACTION_DEBOUNCE_MS) {
    return true
  }

  autoActionDebounceMap.set(key, now)

  // Opportunistic cleanup to avoid unbounded growth.
  for (const [storedKey, timestamp] of autoActionDebounceMap.entries()) {
    if (now - timestamp > AUTO_ACTION_DEBOUNCE_TTL_MS) {
      autoActionDebounceMap.delete(storedKey)
    }
  }

  return false
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('POST /api/game/[gameId]/state')

  try {
    const { gameId } = await params

    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestBody = await request.json()
    const move = requestBody?.move
    const autoActionContext = requestBody?.autoActionContext as AutoActionContext | undefined
    const isAutoAction = autoActionContext?.source === 'turn-timeout'

    if (!move || !move.type) {
      return NextResponse.json({ error: 'Invalid move data' }, { status: 400 })
    }

    if (isAutoAction) {
      if (!autoActionContext?.debounceKey || !autoActionContext.turnSnapshot) {
        return NextResponse.json({ error: 'Invalid auto action context' }, { status: 400 })
      }

      const debounceKey = `${gameId}:${autoActionContext.debounceKey}:${move.type}`
      if (shouldDebounceAutoAction(debounceKey)) {
        return NextResponse.json(
          {
            skipped: true,
            code: 'AUTO_ACTION_DEBOUNCED',
            message: 'Duplicate auto action ignored',
          },
          { status: 202 }
        )
      }
    }

    // Get game from database - optimize by selecting only needed fields
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        state: true,
        status: true,
        currentTurn: true,
        updatedAt: true,
        lastMoveAt: true,
        players: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                id: true,
                bot: true,
              },
            },
          },
        },
        lobby: {
          select: {
            id: true,
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

    interface GamePlayer {
      id: string
      userId: string
      user: {
        id: string
        bot: unknown
      }
    }

    // Verify user is a player in this game
    const playerRecord = (game.players as GamePlayer[]).find((p) => p.userId === userId)
    if (!playerRecord) {
      return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
    }

    // Recreate game engine from saved state
    let gameState: unknown
    try {
      gameState = JSON.parse(game.state)

      // Basic validation of state structure
      if (!gameState || typeof gameState !== 'object') {
        throw new Error('Invalid game state structure')
      }

      if (!Array.isArray((gameState as Record<string, unknown>).players)) {
        throw new Error('Game state missing players array')
      }
    } catch (parseError) {
      log.error('Failed to parse game state', parseError as Error)
      return NextResponse.json({
        error: 'Corrupted game state. Please restart the game.'
      }, { status: 500 })
    }

    let gameEngine: any

    switch (game.lobby.gameType) {
      case 'yahtzee':
        gameEngine = new YahtzeeGame(game.id)
        // Restore state (gameState is validated JSON from DB)
        gameEngine.restoreState(gameState as any)
        break
      case 'tic_tac_toe':
        gameEngine = new TicTacToeGame(game.id)
        gameEngine.restoreState(gameState as any)
        break
      case 'rock_paper_scissors':
        gameEngine = new RockPaperScissorsGame(game.id)
        gameEngine.restoreState(gameState as any)
        break
      default:
        return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
    }

    if (isAutoAction) {
      const snapshot = autoActionContext.turnSnapshot
      const serverState = gameEngine.getState() as any
      const serverCurrentPlayer = gameEngine.getCurrentPlayer()
      const serverStateUpdatedAt = normalizeTimestamp(serverState?.updatedAt)
      const snapshotUpdatedAt = normalizeTimestamp(snapshot.updatedAt)
      const serverLastMoveAt =
        typeof serverState?.lastMoveAt === 'number' && Number.isFinite(serverState.lastMoveAt)
          ? serverState.lastMoveAt
          : null
      const snapshotLastMoveAt =
        typeof snapshot.lastMoveAt === 'number' && Number.isFinite(snapshot.lastMoveAt)
          ? snapshot.lastMoveAt
          : null

      const isSameTurn =
        snapshot.currentPlayerIndex === serverState.currentPlayerIndex &&
        snapshot.currentPlayerId === serverCurrentPlayer?.id &&
        snapshotLastMoveAt === serverLastMoveAt

      const isSameMoveWindow =
        snapshot.rollsLeft === gameEngine.getRollsLeft() &&
        snapshotUpdatedAt !== null &&
        serverStateUpdatedAt !== null &&
        snapshotUpdatedAt === serverStateUpdatedAt

      if (!isSameTurn || !isSameMoveWindow) {
        log.info('Auto action skipped: turn already ended or state changed', {
          gameId,
          userId,
          moveType: move.type,
          snapshot,
          server: {
            currentPlayerId: serverCurrentPlayer?.id,
            currentPlayerIndex: serverState.currentPlayerIndex,
            lastMoveAt: serverLastMoveAt,
            rollsLeft: gameEngine.getRollsLeft(),
            updatedAt: serverStateUpdatedAt,
          },
        })

        return NextResponse.json(
          {
            error: 'Turn already ended',
            code: 'TURN_ALREADY_ENDED',
            skipped: true,
          },
          { status: 409 }
        )
      }

      const turnTimerMs = resolveTurnTimerMs(game.lobby?.turnTimer)
      if (turnTimerMs > 0) {
        const lastMoveAtMs = resolveLastMoveAtMs(serverState?.lastMoveAt, game.lastMoveAt)
        if (lastMoveAtMs !== null) {
          const elapsedMs = Date.now() - lastMoveAtMs
          if (elapsedMs < turnTimerMs) {
            return NextResponse.json(
              {
                error: 'Turn timer still active',
                code: 'TURN_TIMER_ACTIVE',
                skipped: true,
                remainingMs: Math.max(0, turnTimerMs - elapsedMs),
              },
              { status: 409 }
            )
          }
        } else {
          log.warn('Auto action missing lastMoveAt, skipping timer guard', {
            gameId,
            userId,
            moveType: move.type,
          })
        }
      }
    }

    // Create move object
    const gameMove: Move = {
      playerId: userId,
      type: move.type,
      data: move.data || {},
      timestamp: new Date(),
    }

    // Make the move
    const moveResult = gameEngine.makeMove(gameMove)
    if (!moveResult) {
      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    // Check if game status changed after this move
    const newState = gameEngine.getState()
    const botUserIds = new Set(
      (game.players as GamePlayer[])
        .filter((player) => !!player.user?.bot)
        .map((player) => player.userId)
    )
    const disconnectedTurnResult = advanceTurnPastDisconnectedPlayers(newState as any, botUserIds)
    const statusChanged = game.status !== newState.status
    const oldStatus = game.status

    if (disconnectedTurnResult.changed) {
      log.info('Skipped disconnected player turn after move', {
        gameId,
        userId,
        skippedPlayerIds: disconnectedTurnResult.skippedPlayerIds,
        currentPlayerId: disconnectedTurnResult.currentPlayerId,
      })
    }

    const lastMoveAtDate = resolveLastMoveAtDate(newState.lastMoveAt)

    // Optimistic concurrency control:
    // apply update only if game row is still at the same revision we loaded.
    const gameUpdateResult = await prisma.games.updateMany({
      where: {
        id: gameId,
        currentTurn: game.currentTurn,
        updatedAt: game.updatedAt,
      },
      data: {
        state: JSON.stringify(newState),
        status: newState.status,
        currentTurn: newState.currentPlayerIndex,
        ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
        updatedAt: new Date(),
      },
    })

    if (gameUpdateResult.count === 0) {
      const code = isAutoAction ? 'TURN_ALREADY_ENDED' : 'STATE_CONFLICT'
      const message = isAutoAction ? 'Turn already ended' : 'Game state changed, please retry'
      return NextResponse.json(
        { error: message, code, skipped: isAutoAction },
        { status: 409 }
      )
    }

    // Load the updated game after successful CAS write
    const updatedGame = await prisma.games.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        status: true,
        players: {
          select: {
            id: true,
            userId: true,
            score: true,
            user: {
              select: {
                id: true,
                username: true,
                bot: true,  // Bot relation
              },
            },
          },
        },
      },
    })

    if (!updatedGame) {
      return NextResponse.json({ error: 'Game not found after update' }, { status: 404 })
    }

    // Log state transitions for debugging
    if (statusChanged) {
      log.info('Game status changed', {
        gameId,
        userId,
        moveType: gameMove.type,
        oldStatus,
        newStatus: newState.status,
        winner: newState.winner
      })
    }

    // Update player scores
    const enginePlayers = gameEngine.getPlayers()
    await Promise.all(
      enginePlayers.map(async (player: Player) => {
        const dbPlayer = updatedGame.players.find(p => p.userId === player.id)
        if (dbPlayer) {
          await prisma.players.update({
            where: { id: dbPlayer.id },
            data: {
              score: player.score || 0,
              scorecard: JSON.stringify(gameEngine.getScorecard?.(player.id) || {}),
            },
          })
        }
      })
    )

    const authoritativeState = gameEngine.getState()
    const serverBroadcasted = await notifySocket(
      `lobby:${game.lobby.code}`,
      'game-update',
      {
        action: 'state-change',
        payload: authoritativeState,
      }
    )

    if (!serverBroadcasted) {
      log.warn('Failed to broadcast authoritative state snapshot', {
        gameId,
        lobbyCode: game.lobby.code,
        userId,
      })
    }

    const response = {
      game: {
        id: updatedGame.id,
        status: updatedGame.status,
        state: authoritativeState,
        players: updatedGame.players.map(p => ({
          id: p.userId,
          name: p.user.username || 'Unknown',
          score: p.score,
          isBot: !!p.user.bot,
        })),
      },
      serverBroadcasted,
    }

    return NextResponse.json(response)
  } catch (error) {
    log.error('Update game state error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
