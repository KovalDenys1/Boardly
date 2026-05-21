import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'

const limiter = rateLimit(rateLimitPresets.api)

export async function GET(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const user = await getRequestAuthUser(req)
  if (!user?.id) {
    return NextResponse.json({ lobby: null })
  }

  const lobby = await prisma.lobbies.findFirst({
    where: {
      creatorId: user.id,
      isActive: true,
      games: { some: { status: 'waiting' } },
    },
    select: {
      code: true,
      name: true,
      gameType: true,
      maxPlayers: true,
      games: {
        where: { status: 'waiting' },
        select: { _count: { select: { players: { where: { leftAt: null } } } } },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!lobby) {
    return NextResponse.json({ lobby: null })
  }

  return NextResponse.json({
    lobby: {
      code: lobby.code,
      name: lobby.name,
      gameType: lobby.gameType,
      playerCount: lobby.games[0]?._count?.players ?? 0,
      maxPlayers: lobby.maxPlayers,
    },
  })
}
