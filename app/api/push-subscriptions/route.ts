import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { prisma } from '@/lib/db'

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

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  await prisma.pushSubscriptions.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh,
      auth,
      userAgent: req.headers.get('user-agent') ?? undefined,
    },
    update: { p256dh, auth, updatedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
