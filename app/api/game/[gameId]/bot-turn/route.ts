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

    // Load game state
    const game = await prisma.game.findUnique({
      where: { id: params.gameId },
      include: {
        players: {
          include: {
            user: true,
          },
        },
        lobby: true,
      },
    })

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
      try {
        await fetch(`${socketUrl}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: `lobby:${lobbyCode}`,
            event: 'bot-action',
            data: event,
          }),
          signal: AbortSignal.timeout(3000),
        })
      } catch (error) {
        log.warn('Failed to broadcast bot action', { error })
      }
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

          // Save to database
          log.info('Saving bot move to database...')
          await prisma.game.update({
            where: { id: params.gameId },
            data: {
              state: JSON.stringify(gameEngine.getState()),
              status: gameEngine.getState().status,
              currentTurn: gameEngine.getState().currentPlayerIndex,
              updatedAt: new Date(),
            },
          })
          log.info('Database updated successfully')

          // Update player scores
          await Promise.all(
            gameEngine.getPlayers().map(async (player: any) => {
              const dbPlayer = game.players.find((p: any) => p.userId === player.id)
              if (dbPlayer) {
                await prisma.player.update({
                  where: { id: dbPlayer.id },
                  data: {
                    score: player.score || 0,
                    scorecard: JSON.stringify(gameEngine.getScorecard?.(player.id) || {}),
                  },
                })
              }
            })
          )
          log.info('Player scores updated')
          
          // Broadcast state update after each move
          const currentState = gameEngine.getState()
          try {
            await fetch(`${socketUrl}/api/notify`, {
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
              signal: AbortSignal.timeout(3000),
            })
          } catch (error) {
            log.warn('Failed to broadcast move update', { error })
          }
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
