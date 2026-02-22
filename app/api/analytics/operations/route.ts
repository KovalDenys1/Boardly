import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { canAccessProductAnalytics } from '@/lib/analytics-access'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getOperationalKpiDashboard } from '@/lib/operational-metrics'

const log = apiLogger('GET /api/analytics/operations')
const limiter = rateLimit(rateLimitPresets.api)

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const authUser = await getRequestAuthUser(request)
    if (!authUser?.id || authUser.isGuest) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.users.findUnique({
      where: { id: authUser.id },
      select: { id: true, email: true },
    })
    if (!user || !canAccessProductAnalytics({ id: user.id, email: user.email })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const hoursParam = searchParams.get('hours')
    const baselineDaysParam = searchParams.get('baselineDays')

    const dashboard = await getOperationalKpiDashboard(
      hoursParam ? Number(hoursParam) : undefined,
      baselineDaysParam ? Number(baselineDaysParam) : undefined
    )

    return NextResponse.json(dashboard, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    log.error('Failed to build operations analytics dashboard', error as Error)
    return NextResponse.json(
      { error: 'Failed to build operations analytics dashboard' },
      { status: 500 }
    )
  }
}
