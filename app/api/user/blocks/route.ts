import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { requireSessionUser } from '@/lib/session-user'
import { MAX_BLOCKS_PER_ACCOUNT, blockedUserIdSchema } from '@/lib/user-blocks'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('/api/user/blocks')

const bodySchema = z.object({
  userIds: z.array(blockedUserIdSchema).min(1).max(200),
})

async function listBlocks(blockerId: string) {
  const rows = await prisma.userBlocks.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
    select: { blockedId: true, createdAt: true, blocked: { select: { username: true } } },
  })
  return rows.map((row) => ({
    id: row.blockedId,
    username: row.blocked.username ?? '',
    blockedAt: row.createdAt.toISOString(),
  }))
}

export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const auth = await requireSessionUser(request)
    if ('response' in auth) {
      return auth.response
    }

    return NextResponse.json({ blocks: await listBlocks(auth.user.id) })
  } catch (error) {
    log.error('Error listing blocks', error as Error)
    return NextResponse.json({ error: 'Failed to load blocked players' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    const auth = await requireSessionUser(request)
    if ('response' in auth) {
      return auth.response
    }
    const blockerId = auth.user.id

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const userIds = [...new Set(parsed.data.userIds)]
    if (userIds.includes(blockerId)) {
      return NextResponse.json(
        { error: 'You cannot block yourself', code: 'CANNOT_BLOCK_SELF' },
        { status: 400 }
      )
    }

    // The lock makes the cap hold when several requests from one account run at once.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${blockerId}))`

      const existing = await tx.userBlocks.findMany({
        where: { blockerId },
        select: { blockedId: true },
      })
      const alreadyBlocked = new Set(existing.map((row) => row.blockedId))
      const candidates = userIds.filter((id) => !alreadyBlocked.has(id))
      if (candidates.length === 0) {
        return { limited: false, added: 0 }
      }

      // Unknown ids are skipped silently: a guest's stored list can name accounts that were purged.
      const found = await tx.users.findMany({
        where: { id: { in: candidates } },
        select: { id: true },
      })
      if (alreadyBlocked.size + found.length > MAX_BLOCKS_PER_ACCOUNT) {
        return { limited: true, added: 0 }
      }
      if (found.length === 0) {
        return { limited: false, added: 0 }
      }

      await tx.userBlocks.createMany({
        data: found.map((user) => ({ blockerId, blockedId: user.id })),
        skipDuplicates: true,
      })
      return { limited: false, added: found.length }
    })

    if (outcome.limited) {
      return NextResponse.json(
        { error: 'Block limit reached', code: 'BLOCK_LIMIT' },
        { status: 400 }
      )
    }
    if (outcome.added > 0) {
      log.info('Players blocked', { blockerId, count: outcome.added })
    }

    return NextResponse.json({ blocks: await listBlocks(blockerId) })
  } catch (error) {
    log.error('Error blocking players', error as Error)
    return NextResponse.json({ error: 'Failed to block players' }, { status: 500 })
  }
}
