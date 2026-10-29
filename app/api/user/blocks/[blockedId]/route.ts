import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { requireSessionUser } from '@/lib/session-user'
import { blockedUserIdSchema } from '@/lib/validation/user-blocks'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/user/blocks/[blockedId]')

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ blockedId: string }> }
) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const auth = await requireSessionUser(request)
    if ('response' in auth) {
      return auth.response
    }

    const parsed = blockedUserIdSchema.safeParse((await params).blockedId)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    await prisma.userBlocks.deleteMany({
      where: { blockerId: auth.user.id, blockedId: parsed.data },
    })

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    log.error('Error unblocking player', error as Error)
    return NextResponse.json({ error: 'Failed to unblock player' }, { status: 500 })
  }
}
