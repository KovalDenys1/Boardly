import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { generateLobbyCode } from '@/lib/lobby'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/api/lobby')

const createLobbySchema = z.object({
  name: z.string().min(1).max(50),
  password: z.string().optional(),
  maxPlayers: z.number().min(2).max(8).default(4),
  gameType: z.enum(['yahtzee']).default('yahtzee'),
})

const createLimiter = rateLimit(rateLimitPresets.lobbyCreation)

export async function POST(request: NextRequest) {
  // Apply rate limiting for lobby creation
  const rateLimitResult = await createLimiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    // Verify authentication with NextAuth
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      log.error('User not found in database', undefined, { userId: session.user.id })
      return NextResponse.json(
        { error: 'User not found. Please log in again.' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { name, password, maxPlayers, gameType } = createLobbySchema.parse(body)

    log.info('Creating lobby', { gameType, maxPlayers })

    // Generate unique lobby code
    let code = generateLobbyCode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.lobby.findUnique({ where: { code } })
      if (!existing) break
      code = generateLobbyCode()
      attempts++
    }

    // Create lobby with initial game and add creator as first player
    // Initial state for Yahtzee
    const initialState: any = {
        gameType: 'yahtzee',
        players: [],
        currentPlayerIndex: 0,
        status: 'waiting',
        data: {
          round: 0,
          dice: [1, 1, 1, 1, 1],
          held: [false, false, false, false, false],
          rollsLeft: 3,
          scores: [{}],
        }
    }
    
    const lobby = await prisma.lobby.create({
      data: {
        code,
        name,
        password,
        maxPlayers,
        gameType,
        creatorId: user.id,
        games: {
          create: {
            status: 'waiting',
            state: JSON.stringify(initialState),
            players: {
              create: {
                userId: user.id,
                position: 0,
                scorecard: JSON.stringify({}),
              },
            },
          },
        },
      },
      include: {
        games: {
          where: { status: 'waiting' },
          include: {
            players: true,
          },
        },
      },
    })

    return NextResponse.json({ 
      lobby,
      autoJoined: true,
      message: 'Lobby created and you have been added as the first player!'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    log.error('Create lobby error', error as Error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('Foreign key constraint')) {
        return NextResponse.json(
          { error: 'User account not found. Please log out and log in again.' },
          { status: 400 }
        )
      }
    }
    
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get gameType filter from query params
    const { searchParams } = new URL(request.url)
    const gameType = searchParams.get('gameType')

    // Build where clause
    const where: any = { isActive: true }
    if (gameType) {
      where.gameType = gameType
    }

    log.info('Fetching lobbies', { gameType, hasFilter: !!gameType })

    // Get active lobbies with timeout protection
    const lobbies = await Promise.race([
      prisma.lobby.findMany({
        where,
        include: {
          creator: {
            select: {
              username: true,
              email: true,
            },
          },
          games: {
            where: { status: { in: ['waiting', 'playing'] } },
            select: { 
              id: true,
              status: true,
              _count: {
                select: {
                  players: true
                }
              }
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 5000)
      )
    ]) as any[]

    log.info('Lobbies fetched successfully', { count: lobbies.length })
    return NextResponse.json({ lobbies })
  } catch (error) {
    log.error('Get lobbies error', error as Error, { 
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    
    // Return empty array instead of error to prevent UI from breaking
    return NextResponse.json({ 
      lobbies: [],
      error: 'Failed to load lobbies. Please try again.',
    }, { status: 200 }) // Changed to 200 with error message
  }
}
