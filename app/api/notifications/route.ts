import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(parsed)) {
    return 10
  }

  return Math.min(Math.max(parsed, 1), 50)
}

function parseOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw || '', 10)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.max(parsed, 0)
}

function parseFilter(raw: string | null): 'all' | 'unread' {
  return raw === 'unread' ? 'unread' : 'all'
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parseLimit(searchParams.get('limit'))
  const offset = parseOffset(searchParams.get('offset'))
  const filter = parseFilter(searchParams.get('filter'))
  const where = {
    userId: session.user.id,
    channel: 'in_app' as const,
    ...(filter === 'unread' ? { readAt: null } : {}),
  }

  const [notifications, unreadCount] = await Promise.all([
    prisma.notifications.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip: offset,
      take: limit + 1,
      select: {
        id: true,
        type: true,
        createdAt: true,
        readAt: true,
        payload: true,
      },
    }),
    prisma.notifications.count({
      where: {
        userId: session.user.id,
        channel: 'in_app',
        readAt: null,
      },
    }),
  ])

  const hasMore = notifications.length > limit

  return NextResponse.json({
    notifications: notifications.slice(0, limit),
    unreadCount,
    hasMore,
  })
}
