import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { createBot } from '@/lib/bot-helpers'
import { getRequestAuthUser } from '@/lib/request-auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code } = await params

    // Find lobby
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: {
            status: { in: ['waiting', 'playing'] }
          },
          include: {
            players: {
              include: {
                user: {
                  include: {
                    bot: true  // Include bot relation
                  }
                }
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
    if (lobby.creatorId !== userId) {
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
    const botExists = activeGame.players.some((p: any) => p.user.bot !== null)
    if (botExists) {
      return NextResponse.json({ error: 'Bot already in lobby' }, { status: 400 })
    }

    // Create or find bot user
    let botUser = await prisma.users.findFirst({
      where: {
        username: 'AI Bot',
        bot: {
          isNot: null  // Has bot relation
        }
      },
      include: {
        bot: true
      }
    })

    if (!botUser) {
      const result = await createBot('AI Bot', lobby.gameType, 'medium')
      // Type assertion: result.user includes bot relation
      botUser = {
        ...result.user,
        bot: result.bot
      } as any
    }

    // Ensure botUser is defined (TypeScript guard)
    if (!botUser) {
      return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 })
    }

    // Add bot to game
    const position = activeGame.players.length
    await prisma.players.create({
      data: {
        gameId: activeGame.id,
        userId: botUser.id,
        position,
        isReady: true,
        score: 0
      }
    })

    // Fetch updated game
    const updatedGame = await prisma.games.findUnique({
      where: { id: activeGame.id },
      include: {
        players: {
          include: {
            user: {
              include: {
                bot: true  // Include bot relation
              }
            }
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
