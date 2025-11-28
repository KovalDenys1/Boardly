import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { BotMoveExecutor } from '@/lib/bot-executor'
import { getServerSocketUrl } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'

export const maxDuration = 60 // Allow up to 60 seconds for bot execution

// In-memory lock to prevent concurrent bot turns for the same game
const botTurnLocks = new Map<string, boolean>()

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const log = apiLogger('POST /api/game/[gameId]/bot-turn')
  let lockKey: string | null = null
  
  try {
    const { botUserId, lobbyCode } = await request.json()

    if (!botUserId) {
      return NextResponse.json({ error: 'Bot user ID required' }, { status: 400 })
    }

    log.info('Bot turn endpoint called', {
      gameId: params.gameId,
      botUserId
    })

    // Check if bot turn is already in progress for this game
    lockKey = `${params.gameId}:${botUserId}`
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
        where: { id: params.gameId },
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
                  name: true,
                  isBot: true,
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
      
      game = await prisma.game.findUnique(optimizedQuery).catch(async (fetchError) => {
        // Retry once on connection error (serverless cold start issue)
        log.warn('Initial game fetch failed, retrying...', { error: fetchError.code })
        await new Promise(resolve => setTimeout(resolve, 300))
        return prisma.game.findUnique(optimizedQuery)
      })
    } catch (error) {
      log.error('Failed to load game after retry', error as Error)
      return NextResponse.json({ 
        error: 'Database connection error. Please try again.',
        code: 'DB_CONNECTION_FAILED'
      }, { status: 503 })
    }

    if (!game) {
      log.error('Game not found', undefined, { gameId: params.gameId })
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    log.info('Game found, processing bot turn', {
      gameId: game.id,
      statePreview: game.state?.substring(0, 100)
    })

    const gameState = JSON.parse(game.state)
    const gameEngine = new YahtzeeGame(game.id)
    gameEngine.restoreState(gameState)

    // Verify it's the bot's turn
    const currentPlayerIndex = gameEngine.getState().currentPlayerIndex
    const currentPlayer = game.players[currentPlayerIndex]

    if (!currentPlayer || currentPlayer.userId !== botUserId) {
      log.warn('Not bot\'s turn', {
        currentPlayer: currentPlayer?.userId,
        expectedBot: botUserId
      })
      return NextResponse.json({ 
        error: 'Not bot\'s turn',
        currentPlayer: currentPlayer?.userId,
        expectedBot: botUserId
      }, { status: 400 })
    }

    log.info('Verified it\'s bot\'s turn, executing...')

    const socketUrl = getServerSocketUrl()
    
    // Helper function to broadcast bot actions in real-time
    const broadcastBotAction = async (event: any) => {
      // Fire-and-forget pattern - don't wait for Socket.IO
      fetch(`${socketUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: `lobby:${lobbyCode}`,
          event: 'bot-action',
          data: event,
        }),
        signal: AbortSignal.timeout(1000), // Reduced from 3s to 1s
      }).catch(error => {
        log.warn('Failed to broadcast bot action', { error })
      })
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
          log.info('Saving bot move to database...')
          try {
            await prisma.game.update({
              where: { id: params.gameId },
              data: {
                state: JSON.stringify(gameEngine.getState()),
                status: gameEngine.getState().status,
                currentTurn: gameEngine.getState().currentPlayerIndex,
                updatedAt: new Date(),
              },
            }).catch(async (dbError) => {
              // Retry once on connection error (common on serverless cold starts)
              log.warn('Database update failed, retrying...', { error: dbError.message })
              await new Promise(resolve => setTimeout(resolve, 200))
              return prisma.game.update({
                where: { id: params.gameId },
                data: {
                  state: JSON.stringify(gameEngine.getState()),
                  status: gameEngine.getState().status,
                  currentTurn: gameEngine.getState().currentPlayerIndex,
                  updatedAt: new Date(),
                },
              })
            })
            log.info('Database updated successfully')
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
                await prisma.player.update({
                  where: { id: dbPlayer.id },
                  data: {
                    score: player.score || 0,
                    scorecard: JSON.stringify(gameEngine.getScorecard?.(player.id) || {}),
                  },
                }).catch(async (retryError) => {
                  // Retry once on connection error
                  log.warn('Player update failed, retrying...', { playerId: dbPlayer.id })
                  await new Promise(resolve => setTimeout(resolve, 100))
                  return prisma.player.update({
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
          fetch(`${socketUrl}/api/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              room: `lobby:${lobbyCode}`,
              event: 'game-update',
              data: {
                action: 'state-change',
                payload: currentState,
              },
            }),
            signal: AbortSignal.timeout(1000), // Reduced from 3s to 1s
          }).catch(error => {
            log.warn('Failed to broadcast move update', { error })
          })
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
      gameId: params.gameId,
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
