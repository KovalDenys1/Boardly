import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { generateLobbyCode } from '@/lib/lobby'
import { GameRegistry } from '@/lib/game-registry'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/api/lobby')

const createLobbySchema = z.object({
  name: z.string().min(1).max(50),
  password: z.string().optional(),
  maxPlayers: z.number().min(2).max(10).default(6),
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
    // Check for guest or authenticated user
    const session = await getServerSession(authOptions)
    const guestId = request.headers.get('X-Guest-Id')
    const guestName = request.headers.get('X-Guest-Name')
    
    const userId = session?.user?.id || guestId
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, password, maxPlayers, gameType } = createLobbySchema.parse(body)

    // Validate guest name if guest
    if (guestId && (!guestName || guestName.length < 2 || guestName.length > 20)) {
      return NextResponse.json(
        { error: 'Guest name must be 2-20 characters' },
        { status: 400 }
      )
    }

    // Get or create user (for guests, create if doesn't exist)
    let user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      if (guestId && guestName) {
        // Create guest user
        user = await prisma.user.create({
          data: {
            id: guestId,
            username: guestName,
            isBot: false,
            isGuest: true,
            lastActiveAt: new Date(),
          },
        })
      } else {
        log.error('User not found in database', undefined, { userId })
        return NextResponse.json(
          { error: 'User not found. Please log in again.' },
          { status: 404 }
        )
      }
    } else if (guestId && user.isGuest) {
      // Update lastActiveAt for existing guest
      await prisma.user.update({
        where: { id: guestId },
        data: { lastActiveAt: new Date() },
      })
    }

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

    // Get game registration to create initial state
    const gameRegistration = GameRegistry.get(gameType)
    if (!gameRegistration) {
      return NextResponse.json(
        { error: `Unsupported game type: ${gameType}` },
        { status: 400 }
      )
    }

    // Create initial state using game factory
    const initialState = gameRegistration.factory.createInitialState()
    
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
                      isBot: true
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
      
      // Count human (non-bot) players
      const humanPlayerCount = game.players?.filter((p: any) => !p.user.isBot).length || 0
      
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
