import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { BotMoveExecutor } from '@/lib/bot-executor'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'

export const maxDuration = 60 // Allow up to 60 seconds for bot execution

// In-memory lock to prevent concurrent bot turns for the same game
const botTurnLocks = new Map<string, boolean>()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('POST /api/game/[gameId]/bot-turn')
  let lockKey: string | null = null
  let gameId: string | undefined

  try {
    const paramsData = await params
    gameId = paramsData.gameId
    const { botUserId, lobbyCode } = await request.json()

    if (!botUserId) {
      return NextResponse.json({ error: 'Bot user ID required' }, { status: 400 })
    }

    log.info('Bot turn endpoint called', {
      gameId: gameId,
      botUserId
    })

    // Check if bot turn is already in progress for this game
    lockKey = `${gameId}:${botUserId}`
    if (botTurnLocks.get(lockKey)) {
      log.warn('Bot turn already in progress, ignoring duplicate request')
      return NextResponse.json({
        error: 'Bot turn already in progress',
        message: 'Another bot turn request is being processed'
      }, { status: 409 })
    }

    // Acquire lock
    botTurnLocks.set(lockKey, true)

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
      statePreview: game.state?.substring(0, 100)
    })

    // Parse game state with error handling
    let gameState
    try {
      gameState = JSON.parse(game.state)
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

    const gameEngine = new YahtzeeGame(game.id)
    gameEngine.restoreState(gameState)

    // Verify it's the bot's turn
    const currentPlayerIndex = gameEngine.getState().currentPlayerIndex
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

    // Helper function to broadcast bot actions in real-time
    const broadcastBotAction = async (event: any) => {
      // Fire-and-forget pattern - don't wait for Socket.IO
      await notifySocket(`lobby:${lobbyCode}`, 'bot-action', event)
    }

    // Execute bot's turn with visual feedback
    await BotMoveExecutor.executeBotTurn(
      gameEngine,
      botUserId,
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
          const statusChanged = game.status !== newState.status
          const oldStatus = game.status

          log.info('Saving bot move to database...', {
            moveType: botMove.type,
            currentStatus: newState.status
          })

          try {
            await prisma.games.update({
              where: { id: gameId },
              data: {
                state: JSON.stringify(newState),
                status: newState.status,
                currentTurn: newState.currentPlayerIndex,
                lastMoveAt: new Date(),
                updatedAt: new Date(),
              },
            }).catch(async (dbError) => {
              // Retry once on connection error (common on serverless cold starts)
              log.warn('Database update failed, retrying...', { error: dbError.message })
              await new Promise(resolve => setTimeout(resolve, 200))
              return prisma.games.update({
                where: { id: gameId },
                data: {
                  state: JSON.stringify(newState),
                  status: newState.status,
                  currentTurn: newState.currentPlayerIndex,
                  lastMoveAt: new Date(),
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
          } catch (dbError) {
            log.error('Critical: Failed to save game state after retry', dbError as Error)
            throw new Error('Database connection failed. Please try again.')
          }

          // Update player scores - do this sequentially to avoid connection issues
          // Vercel serverless + Supabase pooler can have timeout issues with parallel queries
          for (const player of gameEngine.getPlayers()) {
            const dbPlayer = game.players.find((p: any) => p.userId === player.id)
            if (dbPlayer) {
              try {
                await prisma.players.update({
                  where: { id: dbPlayer.id },
                  data: {
                    score: player.score || 0,
                    scorecard: JSON.stringify(gameEngine.getScorecard?.(player.id) || {}),
                  },
                }).catch(async (retryError) => {
                  // Retry once on connection error
                  log.warn('Player update failed, retrying...', { playerId: dbPlayer.id })
                  await new Promise(resolve => setTimeout(resolve, 100))
                  return prisma.players.update({
                    where: { id: dbPlayer.id },
                    data: {
                      score: player.score || 0,
                      scorecard: JSON.stringify(gameEngine.getScorecard?.(player.id) || {}),
                    },
                  })
                })
              } catch (playerUpdateError) {
                log.error('Failed to update player score', playerUpdateError as Error, {
                  playerId: dbPlayer.id,
                  userId: player.id
                })
                // Continue with other players even if one fails
              }
            }
          }
          log.info('Player scores updated')

          // Broadcast state update after each move - fire-and-forget
          const currentState = gameEngine.getState()
          await notifySocket(
            `lobby:${lobbyCode}`,
            'game-update',
            {
              action: 'state-change',
              payload: currentState,
            }
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

    // Release lock
    botTurnLocks.delete(lockKey)

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

    // Release lock on error
    if (lockKey) {
      botTurnLocks.delete(lockKey)
    }

    return NextResponse.json({
      error: 'Failed to execute bot turn',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
