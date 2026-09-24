import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { getGameDurationMs, getGameEndedAt } from '@/lib/game-display'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('/api/game/[gameId]/results')

  try {
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { gameId } = await params

    // Get game with all players
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
        _count: {
          select: {
            snapshots: true,
          }
        },
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                image: true,
                avatarUrl: true,
                premiumUntil: true,
                bot: true  // Bot relation
              }
            }
          },
          orderBy: {
            finalScore: 'desc'
          }
        },
        lobby: {
          select: {
            code: true,
            name: true,
            gameType: true,
          }
        }
      }
    })

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      )
    }

    // Check if user is a player in this game
    const isPlayer = game.players.some(p => p.userId === userId)

    if (!isPlayer) {
      return NextResponse.json(
        { error: 'You are not a player in this game' },
        { status: 403 }
      )
    }

    const resolvedGameType = game.lobby.gameType || game.gameType
    const g = game as unknown as { endedAt?: Date | null; durationSeconds?: number | null; startedAt?: Date | null }
    // Prefer explicit fields; fall back to inferred values for pre-migration records
    const inferredEndedAt = getGameEndedAt(game.status, game.updatedAt, game.abandonedAt)
    const endedAt = g.endedAt ?? inferredEndedAt
    const durationMs = g.durationSeconds != null
      ? g.durationSeconds * 1000
      : getGameDurationMs(game.createdAt, endedAt)

    // The state goes through the same per-viewer sanitizer as every broadcast.
    // Handing `game.state` back raw let any player read a running game's
    // secrets – the Sketch & Guess word and choices, Memory's card faces,
    // Alias's words – mid-round (#1103). A finished game's sanitizers reveal
    // everything anyway, so the results view loses nothing.
    const parsedState = (() => {
      if (typeof game.state !== 'string') return game.state as Record<string, unknown> | null
      try {
        return JSON.parse(game.state) as Record<string, unknown>
      } catch {
        return null
      }
    })()
    const viewerState = parsedState
      ? sanitizeStateForBroadcast(resolvedGameType, parsedState as { data?: unknown; status?: string }, userId)
      : null

    const now = new Date()
    // Format response
    const formattedGame = {
      id: game.id,
      lobbyCode: game.lobby.code,
      lobbyName: game.lobby.name,
      gameType: resolvedGameType,
      status: game.status,
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
      finishedAt: game.status === 'finished' ? endedAt?.toISOString() ?? null : null,
      endedAt: endedAt?.toISOString() ?? null,
      durationMs,
      abandonedAt: game.abandonedAt?.toISOString() || null,
      hasReplay: game.status === 'finished',
      replayStepCount: game._count.snapshots,
      state: viewerState,
      players: game.players.map(player => ({
        id: player.user.id,
        username: player.user.username,
        avatar: player.user.avatarUrl ?? player.user.image,
        isBot: !!player.user.bot,
        isPremium: !!player.user.premiumUntil && player.user.premiumUntil > now,
        score: player.score,
        finalScore: player.finalScore,
        placement: player.placement,
        isWinner: player.isWinner
      }))
    }

    log.info('Game results fetched', {
      gameId,
      userId,
      status: game.status
    })

    return NextResponse.json(formattedGame)

  } catch (error) {
    log.error('Error fetching game results', error as Error)

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
