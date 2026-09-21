import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getChatHistory, persistChatMessage } from '@/lib/chat-history'
import { broadcastToLobby } from '@/lib/supabase-server'
import { isSketchAndGuessDrawerMuted } from '@/lib/games/sketch-and-guess-game'
import { parsePersistedGameState } from '@/lib/persisted-game-state'

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
        where: { status: { in: ['waiting', 'playing', 'finished'] } },
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
        where: { status: { in: ['waiting', 'playing', 'finished'] } },
        select: {
          id: true,
          gameType: true,
          status: true,
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

  // Sketch & Guess mutes the drawer for the live part of the round: they know
  // the word and are paid for every correct guess (#1034). The page greys their
  // composer out, which stops everyone except the one player with a reason to
  // go round it, so the rule is enforced here as well. The state blob is read
  // in a second query rather than added to the one above, so every other game's
  // chat keeps paying for exactly the columns it did before.
  const activeGame = lobby.games[0]
  if (activeGame?.gameType === 'sketch_and_guess' && activeGame.status === 'playing') {
    const row = await prisma.games.findUnique({
      where: { id: activeGame.id },
      select: { state: true },
    })
    let parsedState: unknown = null
    try {
      parsedState = parsePersistedGameState(row?.state)
    } catch {
      parsedState = null
    }
    if (isSketchAndGuessDrawerMuted({ gameStatus: activeGame.status, state: parsedState, userId: user.id })) {
      return NextResponse.json(
        { error: 'The drawer cannot chat until the reveal', code: 'DRAWER_CHAT_MUTED' },
        { status: 403 }
      )
    }
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

  // The message goes out in full.
  //
  // #801 replaced this with a bare signal — id and timestamp only — and had
  // clients fetch the body from GET /api/lobby/[code]/chat, because the topic
  // was then `lobby:{code}` with a four-digit code and anyone could subscribe
  // by enumerating names. #845 fixed that at the root: the topic now carries a
  // per-lobby secret handed out only behind the same membership check this
  // route applies, so the text reaches exactly the people who could already
  // read it over HTTP.
  //
  // Restoring it is not a preference. getChatHistory() is Redis-backed and
  // no-ops when Redis is unavailable, which in production it is — so the fetch
  // the signal relied on returned an empty list every time and nobody but the
  // sender ever saw a message (#852). A delivery path that depends on a store
  // which is allowed to not exist is not a delivery path.
  //
  // Admitted spectators share the topic and can read this off the wire. They
  // could before #801 too, they are only admitted when the host enables
  // spectators, and they already see the whole game state.
  void broadcastToLobby(code, 'chat-message', chatMessage)

  return NextResponse.json({ ok: true })
}
