import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getOrCreateBotUser, isPrismaUniqueConstraintError } from '@/lib/bot-helpers'
import { getRequestAuthUser } from '@/lib/request-auth'
import { notifySocket } from '@/lib/socket-url'
import { hasBotSupport } from '@/lib/game-registry'
import { getBotDisplayName, normalizeBotDifficulty } from '@/lib/bot-profiles'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    let requestPayload: { difficulty?: string } = {}
    try {
      requestPayload = await request.json()
    } catch {
      requestPayload = {}
    }

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

    if (!hasBotSupport(lobby.gameType)) {
      return NextResponse.json({ error: 'Bots are not supported for this game' }, { status: 400 })
    }

    const botDifficulty = normalizeBotDifficulty(requestPayload?.difficulty)
    const botDisplayName = getBotDisplayName(lobby.gameType, botDifficulty)

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

    const botUser = await getOrCreateBotUser(botDisplayName, lobby.gameType, botDifficulty)

    // Add bot to game
    const position = activeGame.players.length
    try {
      await prisma.players.create({
        data: {
          gameId: activeGame.id,
          userId: botUser.id,
          position,
          isReady: true,
          score: 0
        }
      })
    } catch (error) {
      // If another request added the same bot concurrently, treat as idempotent success.
      if (!isPrismaUniqueConstraintError(error)) {
        throw error
      }
    }

    await notifySocket(
      `lobby:${code}`,
      'player-joined',
      {
        lobbyCode: code,
        username: botUser.username || botDisplayName,
        userId: botUser.id,
        isBot: true,
      }
    )

    await notifySocket(
      `lobby:${code}`,
      'lobby-update',
      { lobbyCode: code, type: 'player-joined' }
    )

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
      bot: {
        userId: botUser.id,
        username: botUser.username || botDisplayName,
        difficulty: botDifficulty,
      },
      message: 'Bot added to lobby',
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
