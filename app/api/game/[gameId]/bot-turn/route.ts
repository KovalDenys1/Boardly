import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { restoreGameEngine, hasBotSupport } from '@/lib/game-registry'
import type { RegisteredGameType } from '@/lib/game-registry'
import { Move } from '@/lib/game-engine'
import { executeBotTurn as executeBot, getBotDifficulty } from '@/lib/bots'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { advanceTurnPastDisconnectedPlayers } from '@/lib/disconnected-turn'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { getRequestAuthUser } from '@/lib/request-auth'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'

export const maxDuration = 60 // Allow up to 60 seconds for bot execution

// In-memory lock to prevent concurrent bot turns for the same game
const botTurnLocks = new Map<string, boolean>()
const DEFAULT_BOT_STATE_NOTIFY_TIMEOUT_MS = 2000
const FAST_BOT_STATE_NOTIFY_TIMEOUT_MS = 250

function resolveBotStateNotifyTimeoutMs(gameType: string): number {
  return gameType === 'tic_tac_toe'
    ? FAST_BOT_STATE_NOTIFY_TIMEOUT_MS
    : DEFAULT_BOT_STATE_NOTIFY_TIMEOUT_MS
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('POST /api/game/[gameId]/bot-turn')
  let lockKey: string | null = null
  let lockAcquired = false
  let gameId: string | undefined

  try {
    const paramsData = await params
    gameId = paramsData.gameId
    const configuredInternalSecret = process.env.SOCKET_SERVER_INTERNAL_SECRET
    const providedInternalSecret = request.headers.get('X-Internal-Secret')
    const hasConfiguredInternalSecret =
      typeof configuredInternalSecret === 'string' && configuredInternalSecret.length > 0
    const isAuthorizedInternalRequest =
      hasConfiguredInternalSecret && providedInternalSecret === configuredInternalSecret
    const requestUser = isAuthorizedInternalRequest ? null : await getRequestAuthUser(request)

    if (!isAuthorizedInternalRequest && !requestUser?.id) {
      log.warn('Unauthorized bot turn request', {
        gameId: gameId,
        hasInternalSecret: !!providedInternalSecret,
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestBody = await request.json()
    const { botUserId, lobbyCode, triggerSource, triggeredAt, turnEndToBotTriggerMs } = requestBody
    const resolvedTriggerSource =
      typeof triggerSource === 'string' && triggerSource.length > 0 ? triggerSource : 'unknown'
    const normalizedTriggeredAt =
      typeof triggeredAt === 'number' && Number.isFinite(triggeredAt) ? triggeredAt : null
    const triggerToBotApiLatencyMs =
      normalizedTriggeredAt !== null ? Math.max(0, Date.now() - normalizedTriggeredAt) : null
    const normalizedTurnEndToBotTriggerMs =
      typeof turnEndToBotTriggerMs === 'number' && Number.isFinite(turnEndToBotTriggerMs)
        ? Math.max(0, turnEndToBotTriggerMs)
        : null

    if (!botUserId) {
      return NextResponse.json({ error: 'Bot user ID required' }, { status: 400 })
    }

    log.info('Bot turn endpoint called', {
      gameId: gameId,
      botUserId,
      triggerSource: resolvedTriggerSource,
      triggerToBotApiLatencyMs,
      turnEndToBotTriggerMs: normalizedTurnEndToBotTriggerMs,
    })

    // Check if bot turn is already in progress for this game
    const candidateLockKey = `${gameId}:${botUserId}`
    if (botTurnLocks.get(candidateLockKey)) {
      log.warn('Bot turn already in progress, ignoring duplicate request')
      return NextResponse.json({
        error: 'Bot turn already in progress',
        message: 'Another bot turn request is being processed'
      }, { status: 409 })
    }

    // Acquire lock
    lockKey = candidateLockKey
    botTurnLocks.set(lockKey, true)
    lockAcquired = true

    // Load game state with retry on connection errors - optimized query
    let game
    try {
      const optimizedQuery = {
        where: { id: gameId },
        select: {
          id: true,
          state: true,
          status: true,
          currentTurn: true,
          players: {
            select: {
              id: true,
              userId: true,
              score: true,
              scorecard: true,
              user: {
                select: {
                  id: true,
                  bot: true,  // Bot relation
                },
              },
            },
          },
          lobby: {
            select: {
              id: true,
              code: true,
              gameType: true,
            },
          },
        },
      }

      game = await prisma.games.findUnique(optimizedQuery).catch(async (fetchError) => {
        // Retry once on connection error (serverless cold start issue)
        log.warn('Initial game fetch failed, retrying...', { error: fetchError.code })
        await new Promise(resolve => setTimeout(resolve, 300))
        return prisma.games.findUnique(optimizedQuery)
      })
    } catch (error) {
      log.error('Failed to load game after retry', error as Error)
      return NextResponse.json({
        error: 'Database connection error. Please try again.',
        code: 'DB_CONNECTION_FAILED'
      }, { status: 503 })
    }

    if (!game) {
      log.error('Game not found', undefined, { gameId: gameId })
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (!isAuthorizedInternalRequest && requestUser?.id) {
      const isParticipant = game.players.some((player) => player.userId === requestUser.id)
      if (!isParticipant) {
        log.warn('Forbidden bot turn request from non-participant', {
          gameId: game.id,
          requesterId: requestUser.id,
        })
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const gameType = game.lobby.gameType
    const resolvedLobbyCode =
      typeof lobbyCode === 'string' && lobbyCode.trim().length > 0
        ? lobbyCode.trim()
        : game.lobby.code

    // Check if this game type supports bots
    if (!hasBotSupport(gameType)) {
      log.warn('Game type does not support bots', { gameType, gameId: game.id })
      return NextResponse.json({
        error: 'This game type does not support bots',
        code: 'BOTS_NOT_SUPPORTED'
      }, { status: 400 })
    }

    // Verify bot player exists and it's actually a bot
    const botPlayer = game.players.find(p => p.userId === botUserId)
    if (!botPlayer) {
      log.error('Bot player not found in game', undefined, { botUserId, gameId: game.id })
      return NextResponse.json({ error: 'Bot player not found' }, { status: 404 })
    }

    if (!botPlayer.user.bot) {
      log.error('Player is not a bot', undefined, { botUserId, gameId: game.id })
      return NextResponse.json({ error: 'Player is not a bot' }, { status: 400 })
    }

    log.info('Game found, processing bot turn', {
      gameId: game.id,
      gameType,
    })

    // Parse game state with error handling
    let gameState: { players: unknown[] } & Record<string, unknown>
    try {
      gameState = parsePersistedGameState(game.state) as { players: unknown[] } & Record<string, unknown>
      // Validate parsed state
      if (!gameState || typeof gameState !== 'object' || !Array.isArray(gameState.players)) {
        throw new Error('Invalid game state structure')
      }
    } catch (parseError) {
      log.error('Failed to parse game state', parseError as Error)
      return NextResponse.json({
        error: 'Corrupted game state. Please restart the game.',
        code: 'INVALID_STATE'
      }, { status: 500 })
    }

    const gameEngine = restoreGameEngine(gameType, game.id, gameState)

    const state = gameEngine.getState() as {
      currentPlayerIndex: number
      status: string
      data?: {
        playersReady?: string[]
      }
    }

    if (gameType === 'rock_paper_scissors') {
      if (state.status !== 'playing') {
        return NextResponse.json({
          error: 'Game is not in playing state',
          code: 'INVALID_GAME_STATUS',
        }, { status: 400 })
      }

      const playersReady = Array.isArray(state.data?.playersReady) ? state.data.playersReady : []
      if (playersReady.includes(botUserId)) {
        return NextResponse.json({
          error: 'Bot already submitted choice this round',
          code: 'BOT_ALREADY_SUBMITTED',
        }, { status: 400 })
      }

      log.info('Verified bot can submit choice for current RPS round', {
        botUserId,
        readyPlayers: playersReady.length,
      })
    } else {
      // Verify turn ownership for turn-based games
      const currentPlayerIndex = state.currentPlayerIndex
      const gamePlayers = gameEngine.getPlayers() // Use game engine's player order (sorted)
      const currentPlayer = gamePlayers[currentPlayerIndex]

      // Find corresponding database player
      const dbCurrentPlayer = game.players.find(p => p.userId === currentPlayer?.id)

      if (!dbCurrentPlayer || dbCurrentPlayer.userId !== botUserId) {
        log.warn('Not bot\'s turn', {
          currentPlayer: dbCurrentPlayer?.userId || currentPlayer?.id,
          expectedBot: botUserId
        })
        return NextResponse.json({
          error: 'Not bot\'s turn',
          currentPlayer: dbCurrentPlayer?.userId || currentPlayer?.id,
          expectedBot: botUserId
        }, { status: 400 })
      }

      log.info('Verified it\'s bot\'s turn, executing...')
    }

    // Get bot difficulty from bot relation
    const botDifficulty = getBotDifficulty(botPlayer)
    log.info('Bot difficulty', { difficulty: botDifficulty })

    // Helper function to broadcast bot actions in real-time
    const broadcastBotAction = async (event: any) => {
      // Fire-and-forget pattern - don't wait for Socket.IO
      await notifySocket(`lobby:${resolvedLobbyCode}`, 'bot-action', event)
    }

    // Dispatch to the appropriate bot executor based on game type
    await executeBot(
      gameType as RegisteredGameType,
      gameEngine,
      botUserId,
      botDifficulty,
      async (botMove: Move) => {
        log.info('Bot making move', { moveType: botMove.type, data: botMove.data })

        try {
          // Make the bot's move
          const moveSuccess = gameEngine.makeMove(botMove)
          log.info('Move result', { success: moveSuccess })

          if (!moveSuccess) {
            log.error('Move validation failed', undefined, {
              move: botMove,
              gameState: gameEngine.getState()
            })
            throw new Error('Move validation failed')
          }

          // Save to database with retry logic
          const newState = gameEngine.getState()
          const botUserIds = new Set(
            game.players
              .filter((player: any) => !!player.user?.bot)
              .map((player: any) => player.userId)
          )
          const disconnectedTurnResult = advanceTurnPastDisconnectedPlayers(newState as any, botUserIds)
          const statusChanged = game.status !== newState.status
          const oldStatus = game.status
          const lastMoveAtDate = typeof newState.lastMoveAt === 'number' && Number.isFinite(newState.lastMoveAt)
            ? new Date(newState.lastMoveAt)
            : undefined

          log.info('Saving bot move to database...', {
            moveType: botMove.type,
            currentStatus: newState.status
          })

          try {
            await prisma.games.update({
              where: { id: gameId },
              data: {
                state: toPersistedGameStateInput(newState),
                status: newState.status,
                currentTurn: newState.currentPlayerIndex,
                ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                updatedAt: new Date(),
              },
            }).catch(async (dbError) => {
              // Retry once on connection error (common on serverless cold starts)
              log.warn('Database update failed, retrying...', { error: dbError.message })
              await new Promise(resolve => setTimeout(resolve, 200))
              return prisma.games.update({
                where: { id: gameId },
                data: {
                  state: toPersistedGameStateInput(newState),
                  status: newState.status,
                  currentTurn: newState.currentPlayerIndex,
                  ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                  updatedAt: new Date(),
                },
              })
            })

            // Log state transitions
            if (statusChanged) {
              log.info('Game status changed by bot', {
                gameId,
                botUserId,
                oldStatus,
                newStatus: newState.status,
                winner: newState.winner
              })
            } else {
              log.info('Database updated successfully')
            }

            if (disconnectedTurnResult.changed) {
              log.info('Skipped disconnected player turn after bot action', {
                gameId,
                botUserId,
                skippedPlayerIds: disconnectedTurnResult.skippedPlayerIds,
                currentPlayerId: disconnectedTurnResult.currentPlayerId,
              })
            }

            const getScorecard =
              typeof (gameEngine as unknown as { getScorecard?: (playerId: string) => unknown }).getScorecard === 'function'
                ? (gameEngine as unknown as { getScorecard: (playerId: string) => unknown }).getScorecard.bind(gameEngine)
                : null
            const dbPlayersByUserId = new Map(
              game.players.map((player: any) => [player.userId, player])
            )
            const changedPlayerUpdates: Array<{ id: string; score: number; scorecard: string }> = []

            for (const player of gameEngine.getPlayers()) {
              const dbPlayer = dbPlayersByUserId.get(player.id)
              if (!dbPlayer) continue

              const nextScore = typeof player.score === 'number' ? player.score : 0
              const nextScorecard = JSON.stringify(getScorecard ? getScorecard(player.id) : {})

              if (dbPlayer.score === nextScore && dbPlayer.scorecard === nextScorecard) {
                continue
              }

              changedPlayerUpdates.push({
                id: dbPlayer.id,
                score: nextScore,
                scorecard: nextScorecard,
              })
            }

            const replaySnapshotPromise = appendGameReplaySnapshot({
              gameId: game.id,
              playerId: botUserId,
              actionType: `bot:${botMove.type}`,
              actionPayload: botMove.data,
              state: newState,
            }).catch((replayError) => {
              log.warn('Failed to append replay snapshot after bot move', {
                gameId,
                botUserId,
                moveType: botMove.type,
                error: replayError,
              })
            })

            for (const scoreUpdate of changedPlayerUpdates) {
              try {
                await prisma.players.update({
                  where: { id: scoreUpdate.id },
                  data: {
                    score: scoreUpdate.score,
                    scorecard: scoreUpdate.scorecard,
                  },
                }).catch(async () => {
                  // Retry once on connection error
                  log.warn('Player update failed, retrying...', { playerId: scoreUpdate.id })
                  await new Promise(resolve => setTimeout(resolve, 100))
                  return prisma.players.update({
                    where: { id: scoreUpdate.id },
                    data: {
                      score: scoreUpdate.score,
                      scorecard: scoreUpdate.scorecard,
                    },
                  })
                })
              } catch (playerUpdateError) {
                log.error('Failed to update player score', playerUpdateError as Error, {
                  playerId: scoreUpdate.id,
                })
                // Continue with other players even if one fails
              }
            }
            void replaySnapshotPromise
          } catch (dbError) {
            log.error('Critical: Failed to save game state after retry', dbError as Error)
            throw new Error('Database connection failed. Please try again.')
          }
          log.info('Player scores updated')

          const notifyTimeoutMs = resolveBotStateNotifyTimeoutMs(gameType)
          const currentState = gameEngine.getState()
          await notifySocket(
            `lobby:${resolvedLobbyCode}`,
            'game-update',
            {
              action: 'state-change',
              payload: currentState,
            },
            0,
            notifyTimeoutMs
          )
        } catch (error) {
          log.error('Error processing bot move', error as Error, {
            moveType: botMove.type,
            botUserId
          })
          throw error // Re-throw to stop bot turn execution
        }
      },
      broadcastBotAction // Pass the callback for bot actions
    )

    log.info('Bot turn execution completed')

    // Final notification removed - already sent after each move
    const finalState = gameEngine.getState()

    return NextResponse.json({
      success: true,
      message: 'Bot turn completed',
      currentPlayerIndex: finalState.currentPlayerIndex
    })

  } catch (error) {
    log.error('Bot turn execution failed', error as Error, {
      gameId: gameId,
      lockKey,
      errorStack: error instanceof Error ? error.stack : undefined,
      errorMessage: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json({
      error: 'Internal server error',
      code: 'BOT_TURN_FAILED',
    }, { status: 500 })
  } finally {
    if (lockAcquired && lockKey) {
      botTurnLocks.delete(lockKey)
    }
  }
}
