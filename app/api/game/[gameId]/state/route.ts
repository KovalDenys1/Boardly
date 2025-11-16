import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { ChessGame } from '@/lib/games/chess-game'
import { Move } from '@/lib/game-engine'
import { BotMoveExecutor } from '@/lib/bot-executor'

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    // Check for guest or authenticated user
    const session = await getServerSession(authOptions)
    const guestId = request.headers.get('X-Guest-Id')
    const userId = session?.user?.id || guestId

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { move } = await request.json()

    if (!move || !move.type) {
      return NextResponse.json({ error: 'Invalid move data' }, { status: 400 })
    }

    // Get game from database
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
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Verify user is a player in this game
    const playerRecord = game.players.find((p: any) => p.userId === userId)
    if (!playerRecord) {
      return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
    }

    // Recreate game engine from saved state
    const gameState = JSON.parse(game.state)
    let gameEngine: any

    switch (game.lobby.gameType) {
      case 'yahtzee':
        gameEngine = new YahtzeeGame(game.id)
        // Restore state
        gameEngine.restoreState(gameState)
        break
      case 'chess':
        gameEngine = new ChessGame(game.id)
        // Restore state
        gameEngine.restoreState(gameState)
        break
      default:
        return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
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

    // Update game state in database
    const updatedGame = await prisma.game.update({
      where: { id: params.gameId },
      data: {
        state: JSON.stringify(gameEngine.getState()),
        status: gameEngine.getState().status,
        currentTurn: gameEngine.getState().currentPlayerIndex,
        updatedAt: new Date(),
      },
      include: {
        players: {
          include: {
            user: true,
          },
        },
      },
    })

    // Update player scores
    await Promise.all(
      gameEngine.getPlayers().map(async (player: any) => {
        const dbPlayer = updatedGame.players.find((p: any) => p.userId === player.id)
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

    const response = {
      game: {
        id: updatedGame.id,
        status: updatedGame.status,
        state: gameEngine.getState(),
        players: updatedGame.players.map((p: any) => ({
          id: p.userId,
          name: p.user.name || 'Unknown',
          score: p.score,
          isBot: p.user.isBot || false,
        })),
      }
    }

    // Check if next player is a bot and execute their turn
    if (game.lobby.gameType === 'yahtzee' && !gameEngine.isGameFinished()) {
      const currentPlayerIndex = gameEngine.getState().currentPlayerIndex
      const currentPlayer = updatedGame.players[currentPlayerIndex]
      
      if (currentPlayer && BotMoveExecutor.isBot(currentPlayer)) {
        console.log('🤖 Next player is a bot, scheduling automatic turn...')
        
        // Execute bot turn asynchronously (don't wait for it)
        setImmediate(async () => {
          try {
            // Reload game state to ensure we have the latest
            const latestGame = await prisma.game.findUnique({
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

            if (!latestGame) return

            const botGameState = JSON.parse(latestGame.state)
            const botGameEngine = new YahtzeeGame(latestGame.id)
            botGameEngine.restoreState(botGameState)

            // Execute bot's turn
            console.log('🤖 [BOT-EXECUTOR] Starting bot turn execution...')
            await BotMoveExecutor.executeBotTurn(
              botGameEngine,
              currentPlayer.userId,
              async (botMove: Move) => {
                console.log(`🤖 [BOT-EXECUTOR] Bot making move: ${botMove.type}`, botMove.data)
                
                // Make the bot's move
                const moveSuccess = botGameEngine.makeMove(botMove)
                console.log(`🤖 [BOT-EXECUTOR] Move result: ${moveSuccess}`)
                
                // Save to database
                console.log('🤖 [BOT-EXECUTOR] Saving bot move to database...')
                await prisma.game.update({
                  where: { id: params.gameId },
                  data: {
                    state: JSON.stringify(botGameEngine.getState()),
                    status: botGameEngine.getState().status,
                    currentTurn: botGameEngine.getState().currentPlayerIndex,
                    updatedAt: new Date(),
                  },
                })
                console.log('🤖 [BOT-EXECUTOR] Database updated successfully')

                // Update player scores
                await Promise.all(
                  botGameEngine.getPlayers().map(async (player: any) => {
                    const dbPlayer = latestGame.players.find((p: any) => p.userId === player.id)
                    if (dbPlayer) {
                      await prisma.player.update({
                        where: { id: dbPlayer.id },
                        data: {
                          score: player.score || 0,
                          scorecard: JSON.stringify(botGameEngine.getScorecard?.(player.id) || {}),
                        },
                      })
                    }
                  })
                )
                console.log('🤖 [BOT-EXECUTOR] Player scores updated')
              }
            )

            console.log('🤖 [BOT-EXECUTOR] Bot turn completed successfully')
            
            // Notify all clients via Socket.IO about the bot's move
            console.log('🤖 [BOT-EXECUTOR] Sending Socket.IO notification to clients...')
            const finalState = botGameEngine.getState()
            
            // Use NEXT_PUBLIC_SOCKET_URL or fallback to localhost
            const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 
                             process.env.SOCKET_URL || 
                             'http://localhost:3001'
            
            console.log('🤖 [BOT-EXECUTOR] Socket URL:', socketUrl)
            
            try {
              // Send notification to Socket.IO server to broadcast to all clients
              const socketResponse = await fetch(`${socketUrl}/api/notify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  room: `lobby:${latestGame.lobby.code}`,
                  event: 'game-update',
                  data: {
                    action: 'state-change',
                    payload: finalState,
                  },
                }),
              }).catch((fetchError) => {
                console.error('🤖 [BOT-EXECUTOR] Fetch error:', fetchError)
                return null
              })
              
              if (socketResponse?.ok) {
                console.log('🤖 [BOT-EXECUTOR] Socket.IO notification sent successfully')
              } else {
                console.warn('🤖 [BOT-EXECUTOR] Failed to send Socket.IO notification, clients may need to poll for updates')
              }
            } catch (error) {
              console.error('🤖 [BOT-EXECUTOR] Error sending Socket.IO notification:', error)
            }
          } catch (error) {
            console.error('Error executing bot turn:', error)
          }
        })
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Update game state error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
