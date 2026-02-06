import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { generateLobbyCode } from '@/lib/lobby'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'

const log = apiLogger('/api/lobby')

const createLobbySchema = z.object({
  name: z.string().min(1).max(50),
  password: z.string().optional(),
  maxPlayers: z.number().min(2).max(10).default(6),
  turnTimer: z.number().int().min(30).max(180).default(60), // Turn time in seconds (30-180)
  gameType: z.enum(['yahtzee', 'guess_the_spy']).default('yahtzee'),
})

const createLimiter = rateLimit(rateLimitPresets.lobbyCreation)

export async function POST(request: NextRequest) {
  // Apply rate limiting for lobby creation
  const rateLimitResult = await createLimiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    // Check for authenticated user or guest
    const session = await getServerSession(authOptions)
    const guestId = request.headers.get('X-Guest-Id')
    const guestName = request.headers.get('X-Guest-Name')

    let user
    if (session?.user?.id) {
      // Authenticated user
      user = await prisma.users.findUnique({
        where: { id: session.user.id },
      })

      if (!user) {
        log.error('User not found in database', undefined, { userId: session.user.id })
        return NextResponse.json(
          { error: 'User not found. Please log in again.' },
          { status: 404 }
        )
      }
    } else if (guestId && guestName) {
      // Guest user
      user = await getOrCreateGuestUser(guestId, guestName)
      log.info('Guest creating lobby', { guestId, guestName })
    } else {
      // No authentication
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, password, maxPlayers, turnTimer, gameType } = createLobbySchema.parse(body)

    log.info('Creating lobby', { gameType, maxPlayers, turnTimer })

    // Generate unique lobby code
    let code = generateLobbyCode()
    let attempts = 0
    while (attempts < 10) {
      const existing = await prisma.lobbies.findUnique({ where: { code } })
      if (!existing) break
      code = generateLobbyCode()
      attempts++
    }

    // Create lobby with initial game and add creator as first player
    // Build initial state depending on selected game type
    let initialState: any
    if (gameType === 'guess_the_spy') {
      initialState = {
        gameType: 'guess_the_spy',
        players: [],
        status: 'waiting',
        currentRound: 0,
        spyIndex: null,
        location: null,
        categories: [],
        votes: {},
      }
    } else {
      // Default to Yahtzee-compatible initial state
      initialState = {
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
        },
      }
    }

    const lobby = await prisma.lobbies.create({
      data: {
        code,
        name,
        password,
        maxPlayers,
        turnTimer,
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
      return NextResponse.json({ error: error.issues }, { status: 400 })
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
    const { searchParams } = new URL(request.url)

    // Parse filters
    const gameType = searchParams.get('gameType')
    const status = searchParams.get('status') // 'waiting', 'playing', 'all'
    const search = searchParams.get('search') // Search by code or name
    const minPlayers = searchParams.get('minPlayers')
    const maxPlayers = searchParams.get('maxPlayers')
    const sortBy = searchParams.get('sortBy') || 'createdAt' // 'createdAt', 'playerCount', 'name'
    const sortOrder = searchParams.get('sortOrder') || 'desc' // 'asc', 'desc'
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    // Build where clause
    const where: any = { isActive: true }

    if (gameType) {
      where.gameType = gameType
    }

    if (search) {
      where.OR = [
        { code: { contains: search.toUpperCase(), mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ]
    }

    log.info('Fetching lobbies', {
      gameType,
      status,
      search,
      minPlayers,
      maxPlayers,
      sortBy,
      sortOrder,
      limit
    })

    // Get lobbies with game status filter
    const gameStatusFilter: any = {}
    if (status === 'waiting') {
      gameStatusFilter.status = 'waiting'
    } else if (status === 'playing') {
      gameStatusFilter.status = 'playing'
    } else {
      // 'all' or no filter - include both waiting and playing
      gameStatusFilter.status = { in: ['waiting', 'playing'] }
    }

    // Get active lobbies with timeout protection
    const lobbies = await Promise.race([
      prisma.lobbies.findMany({
        where,
        include: {
          creator: {
            select: {
              username: true,
              email: true,
            },
          },
          games: {
            where: gameStatusFilter,
            select: {
              id: true,
              status: true,
              _count: {
                select: {
                  players: true
                }
              },
              players: {
                select: {
                  user: {
                    select: {
                      bot: true  // Bot relation
                    }
                  }
                }
              }
            },
          },
        },
        orderBy:
          sortBy === 'name'
            ? { name: sortOrder as 'asc' | 'desc' }
            : { createdAt: sortOrder as 'asc' | 'desc' },
        take: limit,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database query timeout')), 5000)
      )
    ]) as any[]

    // Filter by player count if specified AND filter out games with only bots or no human players
    let filteredLobbies = lobbies.filter(lobby => {
      const game = lobby.games[0]
      if (!game) return false

      // Count human (non-bot) players using bot relation
      const humanPlayerCount = game.players?.filter((p: any) => !p.user.bot).length || 0

      // Exclude games with no human players (abandoned or bot-only games)
      if (humanPlayerCount === 0) return false

      // Apply player count filters
      if (minPlayers || maxPlayers) {
        const playerCount = game._count?.players || 0
        const min = minPlayers ? parseInt(minPlayers) : 0
        const max = maxPlayers ? parseInt(maxPlayers) : Infinity
        return playerCount >= min && playerCount <= max
      }

      return true
    })

    // Sort by player count if requested (can't be done in SQL easily with nested count)
    if (sortBy === 'playerCount') {
      filteredLobbies.sort((a, b) => {
        const countA = a.games[0]?._count?.players || 0
        const countB = b.games[0]?._count?.players || 0
        return sortOrder === 'asc' ? countA - countB : countB - countA
      })
    }

    // Calculate statistics
    const stats = {
      totalLobbies: filteredLobbies.length,
      waitingLobbies: filteredLobbies.filter(l => l.games[0]?.status === 'waiting').length,
      playingLobbies: filteredLobbies.filter(l => l.games[0]?.status === 'playing').length,
      totalPlayers: filteredLobbies.reduce((sum, l) => sum + (l.games[0]?._count?.players || 0), 0),
    }

    log.info('Lobbies fetched successfully', {
      count: filteredLobbies.length,
      stats
    })

    return NextResponse.json({
      lobbies: filteredLobbies,
      stats
    })
  } catch (error) {
    log.error('Get lobbies error', error as Error, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })

    // Return empty array instead of error to prevent UI from breaking
    return NextResponse.json({
      lobbies: [],
      stats: {
        totalLobbies: 0,
        waitingLobbies: 0,
        playingLobbies: 0,
        totalPlayers: 0,
      },
      error: 'Failed to load lobbies. Please try again.',
    }, { status: 200 })
  }
}
