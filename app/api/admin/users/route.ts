import { NextRequest, NextResponse } from 'next/server'
import type { Prisma, UserRole } from '@prisma/client'
import { prisma } from '@/lib/db'
import { withErrorHandler, ValidationError } from '@/lib/error-handler'
import { requireAdminApiUser } from '@/lib/admin-auth'

function parsePositiveInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

async function getAdminUsersHandler(req: NextRequest) {
  await requireAdminApiUser()

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const page = parsePositiveInt(searchParams.get('page'), 1, 1, 10000)
  const pageSize = parsePositiveInt(searchParams.get('pageSize'), 20, 1, 100)
  const suspended = searchParams.get('suspended')
  const role = searchParams.get('role')

  if (role && role !== 'user' && role !== 'admin') {
    throw new ValidationError('Invalid role filter')
  }

  const roleFilter: UserRole | undefined =
    role === 'user' || role === 'admin' ? role : undefined

  const where: Prisma.UsersWhereInput = {
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { username: { contains: q, mode: 'insensitive' as const } },
            { id: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(suspended === 'true' ? { suspended: true } : {}),
    ...(suspended === 'false' ? { suspended: false } : {}),
    ...(roleFilter ? { role: roleFilter } : {}),
  }

  const [total, users] = await Promise.all([
    prisma.users.count({ where }),
    prisma.users.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        suspended: true,
        isGuest: true,
        createdAt: true,
        lastActiveAt: true,
        _count: {
          select: {
            players: true,
            lobbies: true,
          },
        },
      },
    }),
  ])

  return NextResponse.json({
    items: users,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  })
}

export const GET = withErrorHandler(getAdminUsersHandler)
