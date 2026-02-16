import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { restoreGameEngine } from '@/lib/game-registry'
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

    log.info('Game state update attempt', {
      gameId,
      userId,
      isGuest: requestUser?.isGuest,
      username: requestUser?.username,
      hasToken: !!request.headers.get('X-Guest-Token'),
      hasAuth: !!request.headers.get('authorization')
    })

    if (!userId) {
      log.warn('Unauthorized game state update attempt', { gameId })
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
    log.info('Fetching game from database', { gameId, userId })
    
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
            score: true,
            scorecard: true,
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
            id: true,
            code: true,
            gameType: true,
            turnTimer: true,
          },
        },
      },
    }).catch((dbError) => {
      log.error('Database query failed', dbError as Error, { gameId, userId })
      throw dbError
    })

    if (!game) {
      log.warn('Game not found', { gameId, userId })
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    
    log.info('Game fetched successfully', { gameId, status: game.status })

    interface GamePlayer {
      id: string
      userId: string
      score: number
      scorecard: string | null
      user: {
        id: string
        username: string | null
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

    // Use registry to restore the correct engine for this game type
    try {
      gameEngine = restoreGameEngine(game.lobby.gameType, game.id, gameState)
    } catch {
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

      const getRollsLeft =
        typeof (gameEngine as { getRollsLeft?: () => number }).getRollsLeft === 'function'
          ? (gameEngine as { getRollsLeft: () => number }).getRollsLeft.bind(gameEngine)
          : null
      const serverRollsLeft = getRollsLeft ? getRollsLeft() : null

      const isSameMoveWindow =
        snapshotUpdatedAt !== null &&
        serverStateUpdatedAt !== null &&
        snapshotUpdatedAt === serverStateUpdatedAt &&
        (serverRollsLeft === null || snapshot.rollsLeft === serverRollsLeft)

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
            rollsLeft: serverRollsLeft,
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

    // Update player scores. Scorecard is optional and available only for games that implement getScorecard().
    const getScorecard =
      typeof (gameEngine as { getScorecard?: (playerId: string) => unknown }).getScorecard === 'function'
        ? (gameEngine as { getScorecard: (playerId: string) => unknown }).getScorecard.bind(gameEngine)
        : null
    const enginePlayers = gameEngine.getPlayers()
    const gamePlayers = game.players as GamePlayer[]
    const dbPlayersByUserId = new Map(gamePlayers.map((player) => [player.userId, player]))
    const changedPlayerUpdates: Array<Promise<unknown>> = []

    for (const player of enginePlayers as Player[]) {
      const dbPlayer = dbPlayersByUserId.get(player.id)
      if (!dbPlayer) continue

      const nextScore = typeof player.score === 'number' ? player.score : 0
      const nextScorecard = JSON.stringify(
        getScorecard ? getScorecard(player.id) : {}
      )

      if (dbPlayer.score === nextScore && dbPlayer.scorecard === nextScorecard) {
        continue
      }

      changedPlayerUpdates.push(
        prisma.players.update({
          where: { id: dbPlayer.id },
          data: {
            score: nextScore,
            scorecard: nextScorecard,
          },
        })
      )
    }

    const authoritativeState = gameEngine.getState()
    const scoreSyncPromise = changedPlayerUpdates.length > 0
      ? Promise.all(changedPlayerUpdates)
      : Promise.resolve([])
    const [serverBroadcasted] = await Promise.all([
      notifySocket(
        `lobby:${game.lobby.code}`,
        'game-update',
        {
          action: 'state-change',
          payload: authoritativeState,
        },
        0
      ),
      scoreSyncPromise,
    ])

    if (!serverBroadcasted) {
      log.warn('Failed to broadcast authoritative state snapshot', {
        gameId,
        lobbyCode: game.lobby.code,
        userId,
      })
    }

    const requestPlayerIsBot = !!playerRecord.user?.bot
    const botPlayers = gamePlayers.filter((player) => !!player.user?.bot)
    let botUserIdToTrigger: string | null = null

    if (!requestPlayerIsBot && authoritativeState.status === 'playing' && botPlayers.length > 0) {
      if (game.lobby.gameType === 'tic_tac_toe') {
        const currentPlayerId = enginePlayers[authoritativeState.currentPlayerIndex]?.id
        const currentBotPlayer = botPlayers.find((player) => player.userId === currentPlayerId)
        if (currentBotPlayer) {
          botUserIdToTrigger = currentBotPlayer.userId
        }
      } else if (game.lobby.gameType === 'rock_paper_scissors' && gameMove.type === 'submit-choice') {
        const rpsData = (authoritativeState as { data?: { playersReady?: string[] } }).data
        const playersReady = Array.isArray(rpsData?.playersReady) ? rpsData.playersReady : []
        const pendingBot = botPlayers.find((player) => !playersReady.includes(player.userId))
        if (pendingBot) {
          botUserIdToTrigger = pendingBot.userId
        }
      }
    }

    if (botUserIdToTrigger) {
      const botTurnApiUrl = `${request.nextUrl.origin}/api/game/${gameId}/bot-turn`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      log.info('Auto-triggering bot turn after player move', {
        gameId,
        gameType: game.lobby.gameType,
        botUserId: botUserIdToTrigger,
      })

      void fetch(botTurnApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          botUserId: botUserIdToTrigger,
          lobbyCode: game.lobby.code,
        }),
        signal: controller.signal,
      })
        .then(async (botResponse) => {
          clearTimeout(timeoutId)
          if (!botResponse.ok) {
            const errorPayload = await botResponse.json().catch(() => null)
            log.warn('Auto-triggered bot turn failed', {
              gameId,
              botUserId: botUserIdToTrigger,
              status: botResponse.status,
              error: errorPayload,
            })
          }
        })
        .catch((triggerError) => {
          clearTimeout(timeoutId)
          if ((triggerError as Error)?.name === 'AbortError') {
            log.warn('Auto-triggered bot turn request timed out', {
              gameId,
              botUserId: botUserIdToTrigger,
            })
            return
          }

          log.warn('Failed to auto-trigger bot turn request', {
            gameId,
            botUserId: botUserIdToTrigger,
            error: triggerError,
          })
        })
    }

    const response = {
      game: {
        id: game.id,
        status: authoritativeState.status,
        state: authoritativeState,
        players: enginePlayers.map((player: Player) => {
          const dbPlayer = dbPlayersByUserId.get(player.id)
          return {
            id: player.id,
            name: dbPlayer?.user.username || player.name || 'Unknown',
            score: typeof player.score === 'number' ? player.score : 0,
            isBot: !!dbPlayer?.user.bot,
          }
        }),
      },
      serverBroadcasted,
    }

    return NextResponse.json(response)
  } catch (error) {
    log.error('Update game state error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
