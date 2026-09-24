import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'

const limiter = rateLimit(rateLimitPresets.api)

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const signedIn = await requireSessionUser(req)
  if ('response' in signedIn) {
    return signedIn.response
  }
  const { session } = signedIn

  const body = await req.json().catch(() => null)
  const parsed = subscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const userId = session.user.id
  const { endpoint, p256dh, auth } = parsed.data

  // Clean up oldest subscriptions if user has more than 10
  const count = await prisma.pushSubscriptions.count({ where: { userId } })
  if (count >= 10) {
    const oldest = await prisma.pushSubscriptions.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: count - 9,
      select: { id: true },
    })
    await prisma.pushSubscriptions.deleteMany({ where: { id: { in: oldest.map((s) => s.id) } } })
  }

  // Keyed on endpoint alone, the update path would let anyone who learned
  // another user's endpoint overwrite that subscription's encryption keys and
  // silently break their notifications. Scope the update to the caller and
  // reassign the row if the same endpoint reappears under a new user, which is
  // what happens when a device is handed over or a browser profile is reused.
  const updated = await prisma.pushSubscriptions.updateMany({
    where: { endpoint, userId },
    data: { p256dh, auth, updatedAt: new Date() },
  })

  if (updated.count === 0) {
    await prisma.pushSubscriptions.deleteMany({ where: { endpoint } })
    await prisma.pushSubscriptions.create({
      data: {
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers.get('user-agent') ?? undefined,
      },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const signedIn = await requireSessionUser(req)
  if ('response' in signedIn) {
    return signedIn.response
  }
  const { session } = signedIn

  const body = await req.json().catch(() => null)
  const parsed = unsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  await prisma.pushSubscriptions.deleteMany({
    where: { userId: session.user.id, endpoint: parsed.data.endpoint },
  })

  return NextResponse.json({ success: true })
}
