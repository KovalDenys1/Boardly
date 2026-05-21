import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getUserStatsDashboard } from '@/lib/user-stats-dashboard'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('GET /api/user/[id]/stats')

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
    const requesterDbUser = await prisma.users.findUnique({
      where: { id: requesterUserId },
      select: { role: true, suspended: true, premiumUntil: true },
    })
    const requesterIsAdmin = requesterDbUser?.role === 'admin' && !requesterDbUser?.suspended
    const isPremium = !!requesterDbUser?.premiumUntil && requesterDbUser.premiumUntil > new Date()

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

    const payload = await getUserStatsDashboard(prisma, targetUserId, {
      from: fromDate,
      to: toDate,
    })

    const hasAdvancedAccess = isPremium || requesterIsAdmin
    const responsePayload = hasAdvancedAccess
      ? { overall: payload.overall, byGame: payload.byGame, trends: payload.trends }
      : {
          overall: {
            totalGames: payload.overall.totalGames,
            wins: payload.overall.wins,
            losses: payload.overall.losses,
            draws: payload.overall.draws,
            winRate: payload.overall.winRate,
            avgGameDurationMinutes: payload.overall.avgGameDurationMinutes,
            favoriteGame: payload.overall.favoriteGame,
            currentWinStreak: null,
            longestWinStreak: null,
          },
          byGame: null,
          trends: null,
        }

    return NextResponse.json(
      {
        userId: targetUserId,
        ...responsePayload,
        dateRange: payload.dateRange,
        generatedAt: payload.generatedAt,
        isPremium,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
          'X-Stats-Cache': 'bypass',
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
