import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getChatHistory } from '@/lib/chat-history'

const apiLimiter = rateLimit(rateLimitPresets.api)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Invalid lobby code' }, { status: 400 })
  }

  const rateLimitResult = await apiLimiter(req)
  if (rateLimitResult) return rateLimitResult

  const user = await getRequestAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify the user is a player in this lobby
  const lobby = await prisma.lobbies.findUnique({
    where: { code },
    select: {
      id: true,
      games: {
        where: { status: { in: ['waiting', 'playing'] } },
        select: {
          players: { where: { userId: user.id }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!lobby) {
    return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
  }

  const isPlayer = lobby.games.some((g) => g.players.length > 0)
  if (!isPlayer) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const messages = await getChatHistory(code)
  return NextResponse.json({ messages })
}
