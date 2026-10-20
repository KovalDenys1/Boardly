import { createPublicKey } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { parsePersistedGameState } from '@/lib/persisted-game-state'
import { buildLobbyTopic } from '@/lib/lobby-realtime-topic'
import { sealRealtimeMessage } from '@/lib/server/realtime-signing'
import type { SketchAndGuessGameData } from '@/lib/games/sketch-and-guess-game'
import { SKETCH_LIVE_KEY_EVENT, isP256Coordinate } from '@/lib/sketch-live'

const limiter = rateLimit(rateLimitPresets.game)

function isP256Point(x: string, y: string): boolean {
  try {
    createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' })
    return true
  } catch {
    return false
  }
}

/**
 * Certifies the Sketch & Guess drawer's live-stroke key for the current round
 * (lib/sketch-live.ts). The drawer's page asks once per round, then signs every
 * frame it streams with that key; the certificate is what lets the other pages
 * tell the drawer's frames from anybody else's on the same topic.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/sketch-live-key')

  try {
    const { gameId } = await params
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const x = (body as { x?: unknown } | null)?.x
    const y = (body as { y?: unknown } | null)?.y
    if (!isP256Coordinate(x) || !isP256Coordinate(y) || !isP256Point(x, y)) {
      return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
    }

    const game = await prisma.games.findUnique({
      where: { id: gameId },
      select: {
        status: true,
        gameType: true,
        state: true,
        lobby: { select: { code: true, gameType: true, realtimeSecret: true } },
      },
    })
    if (!game || !game.lobby) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }
    if ((game.lobby.gameType || game.gameType) !== 'sketch_and_guess') {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }
    if (game.status !== 'playing') {
      return NextResponse.json({ error: 'Game is not in progress' }, { status: 409 })
    }

    let data: SketchAndGuessGameData | undefined
    try {
      data = parsePersistedGameState<{ data?: SketchAndGuessGameData }>(game.state)?.data
    } catch {
      return NextResponse.json({ error: 'Corrupted game state' }, { status: 500 })
    }
    if (!data || data.phase !== 'drawing' || data.currentDrawerId !== userId) {
      return NextResponse.json({ error: 'Only the drawer streams this round', code: 'NOT_DRAWER' }, { status: 403 })
    }

    const cert = sealRealtimeMessage(buildLobbyTopic(game.lobby.code, game.lobby.realtimeSecret), SKETCH_LIVE_KEY_EVENT, {
      gameId,
      round: data.currentRound,
      drawerId: userId,
      x,
      y,
    })
    if (!cert) {
      return NextResponse.json({ error: 'Realtime signing is not configured' }, { status: 503 })
    }

    return NextResponse.json({ cert }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    log.error('Error certifying a Sketch & Guess live-stroke key', error as Error)
    return NextResponse.json({ error: 'Failed to certify key' }, { status: 500 })
  }
}
