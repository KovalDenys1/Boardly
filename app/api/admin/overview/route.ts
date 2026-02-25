import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withErrorHandler } from '@/lib/error-handler'
import { requireAdminApiUser } from '@/lib/admin-auth'

async function getAdminOverviewHandler() {
  await requireAdminApiUser()

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [
    totalUsers,
    activeUsers24h,
    suspendedUsers,
    totalGames,
    gamesInProgress,
    activeLobbies,
    totalLobbies,
  ] = await Promise.all([
    prisma.users.count({ where: { isGuest: false } }),
    prisma.users.count({ where: { lastActiveAt: { gte: since24h } } }),
    prisma.users.count({ where: { suspended: true } }),
    prisma.games.count(),
    prisma.games.count({ where: { status: 'playing' } }),
    prisma.lobbies.count({ where: { isActive: true } }),
    prisma.lobbies.count(),
  ])

  return NextResponse.json({
    stats: {
      totalUsers,
      activeUsers24h,
      suspendedUsers,
      totalGames,
      gamesInProgress,
      activeLobbies,
      totalLobbies,
    },
    generatedAt: new Date().toISOString(),
  })
}

export const GET = withErrorHandler(getAdminOverviewHandler)
