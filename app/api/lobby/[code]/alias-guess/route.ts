import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { parsePersistedGameState } from '@/lib/persisted-game-state'
import { MAX_ALIAS_GUESS_LENGTH, canPostAliasGuess } from '@/lib/games/alias-guess'

const guessLimiter = rateLimit(rateLimitPresets.aliasGuessPost)

/**
 * Posts an Alias guess to everyone in the lobby.
 *
 * Guesses used to go client to client on the lobby topic, which is the one
 * thing that made them unforgeable-in-name-only: any holder of the topic could
 * post a guess under another player's name (GHSA-g868-9224-wr3p). Receivers
 * now drop every lobby frame the server did not sign, so a guess is sent here,
 * checked against the game, and broadcast by the server with the sender's name
 * taken from the session rather than from the request.
 *
 * Guesses are not stored: they belong to the turn, and the lobby's chat
 * history (POST /api/lobby/[code]/chat) is what players see back in the
 * waiting room.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Invalid lobby code' }, { status: 400 })
  }

  const user = await getRequestAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Counted per player, not per address: an Alias room is often several
  // guessers on one home network, and one shared bucket would cut the whole
  // room off mid-turn. An unauthenticated caller never gets this far.
  const rateLimitResult = await guessLimiter(req, { identity: user.id })
  if (rateLimitResult) return rateLimitResult

  const body = await req.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message.trim() : ''
  if (!message || message.length > MAX_ALIAS_GUESS_LENGTH) {
    return NextResponse.json({ error: 'Invalid guess' }, { status: 400 })
  }

  const lobby = await prisma.lobbies.findUnique({
    where: { code },
    select: {
      games: {
        where: { status: 'playing' },
        select: {
          id: true,
          gameType: true,
          state: true,
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

  const game = lobby.games[0]
  if (!game || game.gameType !== 'alias') {
    return NextResponse.json({ error: 'No Alias game is running in this lobby' }, { status: 409 })
  }
  if (game.players.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let state: unknown = null
  try {
    state = parsePersistedGameState(game.state)
  } catch {
    state = null
  }
  if (!canPostAliasGuess(state, user.id)) {
    return NextResponse.json({ error: 'You cannot guess right now', code: 'ALIAS_GUESS_CLOSED' }, { status: 409 })
  }

  const guess = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    userId: user.id,
    username: user.username || 'Player',
    message,
    type: 'alias-guess',
    lobbyCode: code,
    gameId: game.id,
    timestamp: Date.now(),
  }

  // Awaited: Vercel may freeze the function once the response is returned.
  const sent = await broadcastToLobby(code, 'chat-message', guess)
  if (!sent) {
    return NextResponse.json({ error: 'The guess could not be delivered' }, { status: 502 })
  }

  return NextResponse.json({ ok: true, id: guess.id })
}
