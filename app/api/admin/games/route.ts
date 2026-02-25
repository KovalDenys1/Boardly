import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler, ValidationError } from '@/lib/error-handler'
import { requireAdminApiUser } from '@/lib/admin-auth'

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

async function getAdminGamesHandler(req: NextRequest) {
  await requireAdminApiUser()

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const page = parsePositiveInt(searchParams.get('page'), 1, 1, 10000)
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20, 1, 100)
  const status = searchParams.get('status')

  const allowedStatuses = new Set(['waiting', 'playing', 'finished', 'abandoned', 'cancelled'])
  if (status && !allowedStatuses.has(status)) {
    throw new ValidationError('Invalid game status filter')
  }

  const where = {
    ...(status ? { status: status as 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled' } : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: 'insensitive' as const } },
            { lobby: { code: { contains: q, mode: 'insensitive' as const } } },
            { lobby: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const [total, games] = await Promise.all([
    prisma.games.count({ where }),
    prisma.games.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        gameType: true,
        createdAt: true,
        updatedAt: true,
        lastMoveAt: true,
        abandonedAt: true,
        lobby: {
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
        _count: {
          select: {
            players: true,
          },
        },
      },
    }),
  ])

  return NextResponse.json({
    items: games,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

export const GET = withErrorHandler(getAdminGamesHandler)
