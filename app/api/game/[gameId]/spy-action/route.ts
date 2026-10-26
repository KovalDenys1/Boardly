import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { applySpyAction, spyActionSchema } from '@/lib/spy-action'

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/spy-action')

  try {
    const { gameId } = await params

    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id
    const username = requestUser?.username || 'Guest'

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = spyActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid action', details: parsed.error.flatten() }, { status: 400 })
    }
    const { action, data } = parsed.data

    return await applySpyAction({ gameId, userId, username, action, data, log })
  } catch (err) {
    log.error('Error processing Spy game action', err as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
