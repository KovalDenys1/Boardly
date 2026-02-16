import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getProductMetricsDashboard } from '@/lib/product-metrics'
import { apiLogger } from '@/lib/logger'
import { prisma } from '@/lib/db'
import { canAccessProductAnalytics } from '@/lib/analytics-access'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('GET /api/analytics/product')

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
    const daysParam = searchParams.get('days')
    const parsedDays = daysParam ? Number(daysParam) : undefined

    const dashboard = await getProductMetricsDashboard(parsedDays)

    return NextResponse.json(dashboard, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    })
  } catch (error) {
    log.error('Failed to build product analytics dashboard', error as Error)
    return NextResponse.json(
      { error: 'Failed to build analytics dashboard' },
      { status: 500 }
    )
  }
}
