import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.game)

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // Rate limit join requests
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params
    const { guestId, guestName } = await req.json()

    if (!guestId || !guestName) {
      return NextResponse.json(
        { error: 'Guest ID and name are required' },
        { status: 400 }
      )
    }

    // Validate guest name length
    if (guestName.length < 2 || guestName.length > 20) {
      return NextResponse.json(
        { error: 'Guest name must be 2-20 characters' },
        { status: 400 }
      )
    }

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

    // Check if lobby is full
    const activeGame = lobby.games[0]
    if (activeGame && activeGame.players.length >= lobby.maxPlayers) {
      return NextResponse.json({ error: 'Lobby is full' }, { status: 400 })
    }

    // Create or find guest user
    let guestUser = await prisma.users.findUnique({
      where: { id: guestId },
    })

    if (!guestUser) {
      guestUser = await prisma.users.create({
        data: {
          id: guestId,
          username: guestName,
          isGuest: true,
          lastActiveAt: new Date(),
        },
      })
    } else {
      // Update lastActiveAt for existing guest
      if (guestUser.isGuest) {
        await prisma.users.update({
          where: { id: guestId },
          data: { lastActiveAt: new Date() },
        })
      }
    }

    // Check if guest is already in the lobby
    if (activeGame) {
      const existingPlayer = activeGame.players.find(
        (p: any) => p.userId === guestId
      )
      if (existingPlayer) {
        return NextResponse.json(
          { message: 'Already in lobby', player: existingPlayer },
          { status: 200 }
        )
      }
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
              userId: guestId,
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
          userId: guestId,
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
        guestToken: guestId,
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
