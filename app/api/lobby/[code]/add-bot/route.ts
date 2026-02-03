import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params

    // Find lobby
    const lobby = await prisma.lobby.findUnique({
      where: { code },
      include: {
        games: {
          where: {
            status: { in: ['waiting', 'playing'] }
          },
          include: {
            players: {
              include: {
                user: true
              }
            }
          }
        },
        creator: true
      }
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    // Only lobby creator can add bots
    if (lobby.creatorId !== session.user.id) {
      return NextResponse.json({ error: 'Only lobby creator can add bots' }, { status: 403 })
    }

    const activeGame = lobby.games.find((g: any) => ['waiting', 'playing'].includes(g.status))

    if (!activeGame) {
      return NextResponse.json({ error: 'No active game in lobby' }, { status: 400 })
    }

    // Check if game already started
    if (activeGame.status === 'playing') {
      return NextResponse.json({ error: 'Cannot add bot after game has started' }, { status: 400 })
    }

    // Check if lobby is full
    if (activeGame.players.length >= lobby.maxPlayers) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 })
    }

    // Check if bot already exists in this game
    const botExists = activeGame.players.some((p: any) => p.user.isBot)
    if (botExists) {
      return NextResponse.json({ error: 'Bot already in lobby' }, { status: 400 })
    }

    // Create or find bot user
    let botUser = await prisma.user.findFirst({
      where: {
        username: 'AI Bot',
        isBot: true
      }
    })

    if (!botUser) {
      botUser = await prisma.user.create({
        data: {
          username: 'AI Bot',
          email: `bot-${Date.now()}@boardly.local`,
          isBot: true,
          emailVerified: new Date()
        }
      })
    }

    // Add bot to game
    const position = activeGame.players.length
    await prisma.player.create({
      data: {
        gameId: activeGame.id,
        userId: botUser.id,
        position,
        isReady: true,
        score: 0
      }
    })

    // Fetch updated game
    const updatedGame = await prisma.game.findUnique({
      where: { id: activeGame.id },
      include: {
        players: {
          include: {
            user: true
          },
          orderBy: {
            position: 'asc'
          }
        }
      }
    })

    return NextResponse.json({
      success: true,
      game: updatedGame,
      message: 'Bot added to lobby'
    })
  } catch (error) {
    const log = apiLogger('POST /api/lobby/[code]/add-bot')
    log.error('Error adding bot', error as Error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
