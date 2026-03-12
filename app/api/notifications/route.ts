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

function parseSummary(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
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
  const summary = parseSummary(searchParams.get('summary'))
  const where = {
    userId: session.user.id,
    channel: 'in_app' as const,
    ...(filter === 'unread' ? { readAt: null } : {}),
  }

  const unreadCount = await prisma.notifications.count({
    where: {
      userId: session.user.id,
      channel: 'in_app',
      readAt: null,
    },
  })

  if (summary) {
    return NextResponse.json({
      notifications: [],
      unreadCount,
      hasMore: false,
    })
  }

  const notifications = await prisma.notifications.findMany({
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
  })

  const hasMore = notifications.length > limit

  return NextResponse.json({
    notifications: notifications.slice(0, limit),
    unreadCount,
    hasMore,
  })
}
