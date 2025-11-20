import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { BotMoveExecutor } from '@/lib/bot-executor'
import { getServerSocketUrl } from '@/lib/socket-url'

export const maxDuration = 60 // Allow up to 60 seconds for bot execution

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const { botUserId, lobbyCode } = await request.json()

    if (!botUserId) {
      return NextResponse.json({ error: 'Bot user ID required' }, { status: 400 })
    }

    console.log('🤖 [BOT-TURN-API] ==========================================')
    console.log('🤖 [BOT-TURN-API] Bot turn endpoint called')
    console.log('🤖 [BOT-TURN-API] Game ID:', params.gameId)
    console.log('🤖 [BOT-TURN-API] Bot User ID:', botUserId)

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
      console.error('🤖 [BOT-TURN-API] Game not found')
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    console.log('🤖 [BOT-TURN-API] Game found, current state:', game.state?.substring(0, 100))

    const gameState = JSON.parse(game.state)
    const gameEngine = new YahtzeeGame(game.id)
    gameEngine.restoreState(gameState)

    // Verify it's the bot's turn
    const currentPlayerIndex = gameEngine.getState().currentPlayerIndex
    const currentPlayer = game.players[currentPlayerIndex]

    if (!currentPlayer || currentPlayer.userId !== botUserId) {
      console.warn('🤖 [BOT-TURN-API] Not bot\'s turn')
      return NextResponse.json({ 
        error: 'Not bot\'s turn',
        currentPlayer: currentPlayer?.userId,
        expectedBot: botUserId
      }, { status: 400 })
    }

    console.log('🤖 [BOT-TURN-API] Verified it\'s bot\'s turn, executing...')

    // Execute bot's turn
    await BotMoveExecutor.executeBotTurn(
      gameEngine,
      botUserId,
      async (botMove: Move) => {
        console.log(`🤖 [BOT-TURN-API] Bot making move: ${botMove.type}`, botMove.data)
        
        // Make the bot's move
        const moveSuccess = gameEngine.makeMove(botMove)
        console.log(`🤖 [BOT-TURN-API] Move result: ${moveSuccess}`)
        
        if (!moveSuccess) {
          console.error('🤖 [BOT-TURN-API] Move validation failed!')
          return
        }

        // Save to database
        console.log('🤖 [BOT-TURN-API] Saving bot move to database...')
        await prisma.game.update({
          where: { id: params.gameId },
          data: {
            state: JSON.stringify(gameEngine.getState()),
            status: gameEngine.getState().status,
            currentTurn: gameEngine.getState().currentPlayerIndex,
            updatedAt: new Date(),
          },
        })
        console.log('🤖 [BOT-TURN-API] Database updated successfully')

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
        console.log('🤖 [BOT-TURN-API] Player scores updated')
      }
    )

    console.log('🤖 [BOT-TURN-API] Bot turn execution completed')

    // Notify all clients via Socket.IO
    const finalState = gameEngine.getState()
    const socketUrl = getServerSocketUrl()
    
    console.log('🤖 [BOT-TURN-API] Sending Socket.IO notification...')
    console.log('🤖 [BOT-TURN-API] Socket URL:', socketUrl)
    console.log('🤖 [BOT-TURN-API] Lobby code:', lobbyCode)
    
    try {
      const socketResponse = await fetch(`${socketUrl}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: `lobby:${lobbyCode}`,
          event: 'game-update',
          data: {
            action: 'state-change',
            payload: finalState,
          },
        }),
      })

      if (socketResponse.ok) {
        console.log('🤖 [BOT-TURN-API] Socket.IO notification sent successfully')
      } else {
        console.error('🤖 [BOT-TURN-API] Socket.IO notification failed:', await socketResponse.text())
      }
    } catch (error) {
      console.error('🤖 [BOT-TURN-API] Error sending Socket.IO notification:', error)
    }

    return NextResponse.json({ 
      success: true,
      message: 'Bot turn completed',
      currentPlayerIndex: finalState.currentPlayerIndex
    })

  } catch (error) {
    console.error('🤖 [BOT-TURN-API] Error:', error)
    return NextResponse.json({ 
      error: 'Failed to execute bot turn',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
