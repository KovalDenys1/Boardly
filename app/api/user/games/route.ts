import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger as log } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'
import { Prisma, GameStatus, GameType } from '@/prisma/client'
import { requireSessionUser } from '@/lib/session-user'
import { isRetiredLobbyCode } from '@/lib/lobby'
import { getGameDurationMs, getGameEndedAt } from '@/lib/game-display'

export type ViewerResult = 'won' | 'lost' | 'draw' | 'abandoned' | 'cancelled' | 'inProgress'

/** The game as the viewer's seat saw it end; mirrors viewerOutcome in lib/game-outcome.ts. */
function viewerResultFor(status: string, isWinner: boolean | null, terminalMetadata: unknown): ViewerResult {
  if (status === 'abandoned') return 'abandoned'
  if (status === 'cancelled') return 'cancelled'
  if (status !== 'finished') return 'inProgress'
  const isDraw = !!(terminalMetadata && typeof terminalMetadata === 'object' && (terminalMetadata as { isDraw?: unknown }).isDraw === true)
  if (isDraw) return 'draw'
  return isWinner ? 'won' : 'lost'
}

// Force dynamic rendering (uses request.headers)
export const dynamic = 'force-dynamic'

/**
 * GET /api/user/games
 * Returns user's game history with filters
 * Query params: 
 *   - status: waiting | playing | finished | abandoned | cancelled (optional)
 *   - gameType: yahtzee | tic_tac_toe | rock_paper_scissors | memory | guess_the_spy | other (optional)
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
    const auth = await requireSessionUser(request)
    if ('response' in auth) {
      return auth.response
    }
    const { session } = auth

    const userId = session.user.id
    const { searchParams } = new URL(request.url)

    const dbUser = await prisma.users.findUnique({
      where: { id: userId },
      select: { premiumUntil: true },
    })
    const isPremium = !!dbUser?.premiumUntil && dbUser.premiumUntil > new Date()

    // Parse query params
    const statusParam = searchParams.get('status')
    const gameTypeParam = searchParams.get('gameType')
    const FREE_GAME_HISTORY_LIMIT = 20
    const rawLimit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const limit = isPremium ? rawLimit : Math.min(rawLimit, FREE_GAME_HISTORY_LIMIT)
    const offset = isPremium ? parseInt(searchParams.get('offset') || '0') : 0

    logger.info('Fetching user game history', {
      userId,
      status: statusParam,
      gameType: gameTypeParam,
      limit,
      offset,
    })

    // Build where clause
    const where: Prisma.GamesWhereInput = {
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

    const [games, totalCount] = await Promise.all([
      prisma.games.findMany({
        where,
        select: {
          id: true,
          gameType: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          abandonedAt: true,
          endedAt: true,
          durationSeconds: true,
          terminalMetadata: true,
          lobby: {
            select: {
              code: true,
              name: true,
            },
          },
          _count: {
            select: {
              snapshots: true,
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
                  bot: true,
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
      prisma.games.count({ where }),
    ])

    logger.info('User game history fetched successfully', {
      userId,
      count: games.length,
      totalCount,
    })

    const visibleTotalCount = isPremium ? totalCount : Math.min(totalCount, FREE_GAME_HISTORY_LIMIT)
    const capped = !isPremium && totalCount > FREE_GAME_HISTORY_LIMIT

    return NextResponse.json({
      games: games.map((game) => {
        const endedAt = game.endedAt ?? getGameEndedAt(game.status, game.updatedAt, game.abandonedAt)
        const durationMs = game.durationSeconds != null
          ? game.durationSeconds * 1000
          : getGameDurationMs(game.createdAt, endedAt)
        const viewerSeat = game.players.find((player) => player.userId === userId)
        return {
          id: game.id,
          // A retired code (#1130) is `~<lobby id>`: nothing to show or join.
          lobbyCode: isRetiredLobbyCode(game.lobby.code) ? null : game.lobby.code,
          lobbyName: game.lobby.name,
          gameType: game.gameType,
          status: game.status,
          createdAt: game.createdAt,
          updatedAt: game.updatedAt,
          abandonedAt: game.abandonedAt,
          durationMs,
          viewerResult: viewerResultFor(game.status, viewerSeat?.isWinner ?? null, game.terminalMetadata),
          hasReplay: game.status === 'finished' && game._count.snapshots > 0,
          players: game.players.map((player) => ({
            id: player.id,
            userId: player.userId,
            isViewer: player.userId === userId,
            username: player.user.username,
            isBot: !!player.user.bot,
            score: player.score,
            finalScore: player.finalScore,
            placement: player.placement,
            isWinner: player.isWinner,
          })),
        }
      }),
      pagination: {
        limit,
        offset,
        totalCount: visibleTotalCount,
        hasMore: offset + limit < visibleTotalCount,
        capped,
        hiddenCount: capped ? totalCount - FREE_GAME_HISTORY_LIMIT : 0,
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
