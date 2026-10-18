import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/user/accept-terms')

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const user = await getRequestAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.users.updateMany({
      where: { id: user.id, termsAcceptedAt: null },
      data: { termsAcceptedAt: new Date() },
    })

    const row = await prisma.users.findUnique({
      where: { id: user.id },
      select: { termsAcceptedAt: true },
    })
    if (!row?.termsAcceptedAt) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ termsAcceptedAt: row.termsAcceptedAt.toISOString() })
  } catch (error) {
    log.error('Error accepting terms', error as Error)
    return NextResponse.json({ error: 'Failed to accept the terms' }, { status: 500 })
  }
}
