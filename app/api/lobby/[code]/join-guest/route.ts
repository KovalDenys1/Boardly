import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { z } from 'zod'
import {
  createGuestId,
  createGuestToken,
  getGuestTokenFromRequest,
  verifyGuestToken,
} from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'

const limiter = rateLimit(rateLimitPresets.game)
const joinGuestSchema = z.object({
  guestName: z.string().trim().min(2).max(20),
  guestToken: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // Rate limit join requests
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params
    const parsedBody = joinGuestSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Guest name must be 2-20 characters' }, { status: 400 })
    }

    const providedToken = parsedBody.data.guestToken || getGuestTokenFromRequest(req)
    const existingGuestClaims = providedToken ? verifyGuestToken(providedToken) : null
    const requestedGuestName = parsedBody.data.guestName
    const guestId = existingGuestClaims?.guestId || createGuestId()

    // Find the lobby
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: {
            status: {
              in: ['waiting', 'playing'],
            },
          },
          include: {
            players: true,
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const guestUser = await getOrCreateGuestUser(guestId, requestedGuestName)
    const guestName = guestUser.username || requestedGuestName
    const guestToken = createGuestToken(guestUser.id, guestName)

    const activeGame = lobby.games[0]

    // Check if guest is already in the lobby
    if (activeGame) {
      const existingPlayer = activeGame.players.find(
        (p: any) => p.userId === guestUser.id
      )
      if (existingPlayer) {
        return NextResponse.json(
          {
            message: 'Already in lobby',
            player: existingPlayer,
            guestId: guestUser.id,
            guestName,
            guestToken,
          },
          { status: 200 }
        )
      }
    }

    // Check if lobby is full
    if (activeGame && activeGame.players.length >= lobby.maxPlayers) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 })
    }

    // Create or get the active game
    let game
    if (!activeGame) {
      game = await prisma.games.create({
        data: {
          lobbyId: lobby.id,
          status: 'waiting',
          state: JSON.stringify({}), // Empty initial state
          players: {
            create: {
              userId: guestUser.id,
              position: 0,
            },
          },
        },
        include: {
          players: {
            include: {
              user: true,
            },
          },
        },
      })
    } else {
      // Add guest player to existing game
      const nextPosition = activeGame.players.length
      await prisma.players.create({
        data: {
          gameId: activeGame.id,
          userId: guestUser.id,
          position: nextPosition,
        },
      })

      // Refresh game data
      const refreshedGame = await prisma.games.findUnique({
        where: { id: activeGame.id },
        include: { 
          players: {
            include: {
              user: true,
            },
          },
        },
      })

      if (!refreshedGame) {
        return NextResponse.json(
          { error: 'Failed to refresh game data' },
          { status: 500 }
        )
      }
      
      game = refreshedGame
    }

    return NextResponse.json(
      {
        message: 'Guest joined successfully',
        game,
        guestId: guestUser.id,
        guestName,
        guestToken,
      },
      { status: 200 }
    )
  } catch (error: any) {
    const log = apiLogger('POST /api/lobby/[code]/join-guest')
    log.error('Error joining as guest', error)
    return NextResponse.json(
      { error: 'Failed to join as guest' },
      { status: 500 }
    )
  }
}
