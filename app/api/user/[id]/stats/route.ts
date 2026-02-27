import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma, GameStatus } from '@prisma/client'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { isAdminUser } from '@/lib/admin-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { calculateUserStats } from '@/lib/stats-calculator'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('GET /api/user/[id]/stats')
const STATS_CACHE_TTL_MS = 60 * 1000

interface StatsCacheEntry {
  signature: string
  expiresAt: number
  payload: unknown
}

const statsCache = new Map<string, StatsCacheEntry>()

function parseDateRangeParam(raw: string | null, { endOfDay }: { endOfDay: boolean }): Date | null {
  if (!raw) return null

  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const isoValue = isDateOnly
    ? `${raw}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
    : raw

  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${raw}`)
  }

  return parsed
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let targetUserId = 'unknown'

  try {
    const resolvedParams = await params
    targetUserId = resolvedParams.id

    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requesterUserId = session.user.id
    const requesterIsAdmin = await isAdminUser(requesterUserId)

    if (requesterUserId !== targetUserId && !requesterIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    let fromDate: Date | null
    let toDate: Date | null
    try {
      fromDate = parseDateRangeParam(fromParam, { endOfDay: false })
      toDate = parseDateRangeParam(toParam, { endOfDay: true })
    } catch (error) {
      return NextResponse.json(
        { error: (error as Error).message || 'Invalid date range' },
        { status: 400 }
      )
    }

    if (fromDate && toDate && fromDate > toDate) {
      return NextResponse.json(
        { error: '`from` must be less than or equal to `to`' },
        { status: 400 }
      )
    }

    const where: Prisma.GamesWhereInput = {
      players: {
        some: {
          userId: targetUserId,
        },
      },
      status: {
        in: [GameStatus.finished, GameStatus.abandoned, GameStatus.cancelled],
      },
    }

    if (fromDate || toDate) {
      where.createdAt = {}
      if (fromDate) {
        where.createdAt.gte = fromDate
      }
      if (toDate) {
        where.createdAt.lte = toDate
      }
    }

    const cacheKey = `${targetUserId}|${fromDate?.toISOString() ?? 'none'}|${toDate?.toISOString() ?? 'none'}`
    const cacheSnapshot = await prisma.games.aggregate({
      where,
      _count: {
        id: true,
      },
      _max: {
        updatedAt: true,
      },
    })
    const cacheSignature = `${cacheSnapshot._count.id}:${cacheSnapshot._max.updatedAt?.toISOString() ?? 'none'}`
    const cachedEntry = statsCache.get(cacheKey)
    if (cachedEntry && cachedEntry.signature === cacheSignature && Date.now() < cachedEntry.expiresAt) {
      return NextResponse.json(cachedEntry.payload, {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Stats-Cache': 'hit',
        },
      })
    }

    const games = await prisma.games.findMany({
      where,
      select: {
        id: true,
        gameType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        players: {
          select: {
            userId: true,
            score: true,
            finalScore: true,
            isWinner: true,
            placement: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    })

    const stats = calculateUserStats(targetUserId, games, {
      from: fromDate,
      to: toDate,
    })
    const payload = {
      userId: targetUserId,
      ...stats,
    }
    statsCache.set(cacheKey, {
      signature: cacheSignature,
      expiresAt: Date.now() + STATS_CACHE_TTL_MS,
      payload,
    })

    return NextResponse.json(
      payload,
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Stats-Cache': 'miss',
        },
      }
    )
  } catch (error) {
    log.error('Failed to build user stats dashboard', error as Error, {
      userId: targetUserId,
    })
    return NextResponse.json(
      { error: 'Failed to load user stats' },
      { status: 500 }
    )
  }
}
