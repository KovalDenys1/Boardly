import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger as log } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { Prisma, GameStatus, GameType } from '@prisma/client'

// Force dynamic rendering (uses request.headers)
export const dynamic = 'force-dynamic'

/**
 * GET /api/user/games
 * Returns user's game history with filters
 * Query params: 
 *   - status: waiting | playing | finished | abandoned | cancelled (optional)
 *   - gameType: yahtzee | chess | guess_the_spy | uno | other (optional)
 *   - limit: number of games to return (default 50)
 *   - offset: pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  const logger = log('/api/user/games')
  
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit({
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 30,
    })(request)
    
    if (rateLimitResult) {
      return rateLimitResult
    }

    // Get user session
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    
    // Parse query params
    const statusParam = searchParams.get('status')
    const gameTypeParam = searchParams.get('gameType')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    logger.info('Fetching user game history', {
      userId,
      status: statusParam,
      gameType: gameTypeParam,
      limit,
      offset,
    })

    // Build where clause
    const where: Prisma.GameWhereInput = {
      players: {
        some: {
          userId,
        },
      },
    }

    if (statusParam) {
      where.status = statusParam as GameStatus
    }

    if (gameTypeParam) {
      where.gameType = gameTypeParam as GameType
    }

    // Fetch games with player data
    const [games, totalCount] = await Promise.all([
      prisma.game.findMany({
        where,
        include: {
          lobby: {
            select: {
              code: true,
              name: true,
            },
          },
          players: {
            select: {
              id: true,
              userId: true,
              score: true,
              finalScore: true,
              placement: true,
              isWinner: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  isBot: true,
                },
              },
            },
            orderBy: {
              placement: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
      prisma.game.count({ where }),
    ])

    logger.info('User game history fetched successfully', {
      userId,
      count: games.length,
      totalCount,
    })

    return NextResponse.json({
      games: games.map((game) => ({
        id: game.id,
        lobbyCode: game.lobby.code,
        lobbyName: game.lobby.name,
        gameType: game.gameType,
        status: game.status,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        abandonedAt: game.abandonedAt,
        players: game.players.map((player) => ({
          id: player.id,
          username: player.user.username,
          isBot: player.user.isBot,
          score: player.score,
          finalScore: player.finalScore,
          placement: player.placement,
          isWinner: player.isWinner,
        })),
      })),
      pagination: {
        limit,
        offset,
        totalCount,
        hasMore: offset + limit < totalCount,
      },
    })
  } catch (error) {
    logger.error('Error fetching user game history', error as Error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
