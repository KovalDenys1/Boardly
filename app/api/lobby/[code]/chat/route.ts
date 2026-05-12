import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getChatHistory, persistChatMessage } from '@/lib/chat-history'
import { broadcastToLobby } from '@/lib/supabase-server'

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

const postLimiter = rateLimit({ windowMs: 60 * 1000, maxRequests: 30 })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Invalid lobby code' }, { status: 400 })
  }

  const rateLimitResult = await postLimiter(req)
  if (rateLimitResult) return rateLimitResult

  const user = await getRequestAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > 500) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
  }

  const lobby = await prisma.lobbies.findUnique({
    where: { code },
    select: {
      id: true,
      games: {
        where: { status: { in: ['waiting', 'playing'] } },
        select: { players: { where: { userId: user.id }, select: { id: true } } },
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

  const username = user.username || 'Player'
  const chatMessage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: user.id,
    username,
    message,
    lobbyCode: code,
    timestamp: Date.now(),
  }

  await persistChatMessage(chatMessage)
  void broadcastToLobby(code, 'chat-message', chatMessage)

  return NextResponse.json({ ok: true })
}
