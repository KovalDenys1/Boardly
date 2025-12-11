import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const log = apiLogger('/api/game/[gameId]/results')
  
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { gameId } = params

    // Get game with all players
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                
                isBot: true
              }
            }
          },
          orderBy: {
            finalScore: 'desc'
          }
        },
        lobby: {
          select: {
            code: true,
            name: true,
          }
        }
      }
    })

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      )
    }

    // Check if user is a player in this game
    const isPlayer = game.players.some(p => p.userId === session.user.id)
    
    if (!isPlayer) {
      return NextResponse.json(
        { error: 'You are not a player in this game' },
        { status: 403 }
      )
    }

    // Format response
    const formattedGame = {
      id: game.id,
      lobbyCode: game.lobby.code,
      lobbyName: game.lobby.name,
      gameType: game.gameType,
      status: game.status,
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
      finishedAt: null, // Game model doesn't have finishedAt field
      abandonedAt: game.abandonedAt?.toISOString() || null,
      state: game.state, // Include full game state for detailed view
      players: game.players.map(player => ({
        id: player.user.id,
        username: player.user.username,
        isBot: player.user.isBot,
        score: player.score,
        finalScore: player.finalScore,
        placement: player.placement,
        isWinner: player.isWinner
      }))
    }

    log.info('Game results fetched', {
      gameId,
      userId: session.user.id,
      status: game.status
    })

    return NextResponse.json(formattedGame)

  } catch (error) {
    log.error('Error fetching game results', error as Error)
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
