import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { BotMoveExecutor } from '@/lib/bot-executor'
import { apiLogger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params

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

    // Get game from database - optimize by selecting only needed fields
    const game = await prisma.games.findUnique({
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
      const log = apiLogger('POST /api/game/[gameId]/state')
      log.error('Failed to parse game state', parseError as Error)
      return NextResponse.json({
        error: 'Corrupted game state. Please restart the game.'
      }, { status: 500 })
    }

    let gameEngine: YahtzeeGame

    switch (game.lobby.gameType) {
      case 'yahtzee':
        gameEngine = new YahtzeeGame(game.id)
        // Restore state (gameState is validated JSON from DB)
        gameEngine.restoreState(gameState as any)
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

    // Check if game status changed after this move
    const newState = gameEngine.getState()
    const statusChanged = game.status !== newState.status
    const oldStatus = game.status

    // Update game state in database
    const updatedGame = await prisma.games.update({
      where: { id: gameId },
      data: {
        state: JSON.stringify(newState),
        status: newState.status,
        currentTurn: newState.currentPlayerIndex,
        lastMoveAt: new Date(), // Track when this move was made
        updatedAt: new Date(),
      },
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

    // Log state transitions for debugging
    const log = apiLogger('POST /api/game/[gameId]/state')
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
      enginePlayers.map(async (player) => {
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

    const response = {
      game: {
        id: updatedGame.id,
        status: updatedGame.status,
        state: gameEngine.getState(),
        players: updatedGame.players.map(p => ({
          id: p.userId,
          name: p.user.username || 'Unknown',
          score: p.score,
          isBot: !!p.user.bot,
        })),
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    const log = apiLogger('POST /api/game/[gameId]/state')
    log.error('Update game state error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
