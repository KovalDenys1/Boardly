import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { generateLobbyCode } from '@/lib/lobby'
import { createGameEngine } from '@/lib/game-registry'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'

const log = apiLogger('/api/lobby')

const createLobbySchema = z.object({
  name: z.string().min(1).max(50),
  password: z.string().optional(),
  maxPlayers: z.number().min(2).max(10).default(6),
  turnTimer: z.number().int().min(30).max(180).default(60), // Turn time in seconds (30-180)
  gameType: z.enum(['yahtzee', 'guess_the_spy', 'tic_tac_toe', 'rock_paper_scissors']).default('yahtzee'),
  ticTacToeRounds: z.number().int().min(1).max(100).nullable().optional(),
})

const createLimiter = rateLimit(rateLimitPresets.lobbyCreation)
const WAITING_LOBBY_STALE_MS = 60 * 60 * 1000
const MAX_LOBBY_CODE_ATTEMPTS = 10

function isLobbyCodeConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const prismaCode = (error as { code?: unknown }).code
  if (prismaCode !== 'P2002') return false

  const target = (error as { meta?: { target?: unknown } }).meta?.target
  if (Array.isArray(target)) {
    return target.some((entry) => String(entry).toLowerCase().includes('code'))
  }

  if (typeof target === 'string') {
    return target.toLowerCase().includes('code')
  }

  return false
}

export async function POST(request: NextRequest) {
  // Apply rate limiting for lobby creation
  const rateLimitResult = await createLimiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const requestUser = await getRequestAuthUser(request)
    if (!requestUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (requestUser.isGuest) {
      log.info('Guest creating lobby', {
        guestId: requestUser.id,
        guestName: requestUser.username,
      })
    }

    const body = await request.json()
    const { name, password, maxPlayers, turnTimer, gameType, ticTacToeRounds } = createLobbySchema.parse(body)
    const normalizedTicTacToeRounds = gameType === 'tic_tac_toe' ? (ticTacToeRounds ?? null) : undefined

    log.info('Creating lobby', {
      gameType,
      maxPlayers,
      turnTimer,
      ...(gameType === 'tic_tac_toe' ? { targetRounds: normalizedTicTacToeRounds } : {}),
    })

    // Create lobby with initial game and add creator as first player
    // Build initial state via game engine registry
    const tempEngine = createGameEngine(
      gameType,
      'temp_lobby_init',
      gameType === 'tic_tac_toe'
        ? {
            rules: {
              targetRounds: normalizedTicTacToeRounds,
            },
          }
        : undefined
    )
    const initialState = tempEngine.getState()

    let lobby:
      | {
          id: string
          code: string
          name: string
          maxPlayers: number
          turnTimer: number
          gameType: string
          creatorId: string
        }
      | null = null

    for (let attempt = 1; attempt <= MAX_LOBBY_CODE_ATTEMPTS; attempt += 1) {
      const code = generateLobbyCode()

      try {
        lobby = await prisma.lobbies.create({
          data: {
            code,
            name,
            password,
            maxPlayers,
            turnTimer,
            gameType,
            creatorId: requestUser.id,
            games: {
              create: {
                status: 'waiting',
                gameType,
                state: JSON.stringify(initialState),
                players: {
                  create: {
                    userId: requestUser.id,
                    position: 0,
                    scorecard: JSON.stringify({}),
                  },
                },
              },
            },
          },
          select: {
            id: true,
            code: true,
            name: true,
            maxPlayers: true,
            turnTimer: true,
            gameType: true,
            creatorId: true,
          },
        })
        break
      } catch (createError) {
        if (isLobbyCodeConflict(createError)) {
          if (attempt === MAX_LOBBY_CODE_ATTEMPTS) {
            break
          }
          continue
        }

        throw createError
      }
    }

    if (!lobby) {
      log.warn('Failed to create lobby after code generation retries', {
        userId: requestUser.id,
        maxAttempts: MAX_LOBBY_CODE_ATTEMPTS,
      })
      return NextResponse.json(
        { error: 'Failed to generate lobby code. Please try again.' },
        { status: 503 }
      )
    }

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

    // Get active lobbies with timeout protection and clear timeout handle after race settles.
    let queryTimeout: NodeJS.Timeout | null = null
    const lobbies = (await (async () => {
      try {
        return await Promise.race([
          prisma.lobbies.findMany({
            where,
            select: {
              id: true,
              code: true,
              name: true,
              maxPlayers: true,
              turnTimer: true,
              isActive: true,
              gameType: true,
              createdAt: true,
              creatorId: true,
              password: true,
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
                  updatedAt: true,
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
          new Promise<never>((_, reject) => {
            queryTimeout = setTimeout(() => reject(new Error('Database query timeout')), 5000)
          }),
        ])
      } finally {
        if (queryTimeout) {
          clearTimeout(queryTimeout)
          queryTimeout = null
        }
      }
    })()) as any[]

    // Normalize lobbies to a single relevant active game record.
    const lobbiesWithRelevantGame = lobbies
      .map((lobby) => {
        const game = pickRelevantLobbyGame(lobby.games || [])
        if (!game) return null
        return {
          ...lobby,
          games: [game],
        }
      })
      .filter(Boolean) as any[]

    // Filter by player count if specified AND filter out games with only bots or no human players
    let filteredLobbies = lobbiesWithRelevantGame.filter(lobby => {
      const game = lobby.games[0]
      const updatedAtMs = game.updatedAt instanceof Date ? game.updatedAt.getTime() : 0

      // Avoid listing waiting lobbies that have been inactive for too long.
      if (game.status === 'waiting' && updatedAtMs > 0 && Date.now() - updatedAtMs > WAITING_LOBBY_STALE_MS) {
        return false
      }

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

    const sanitizedLobbies = filteredLobbies.map(lobby => {
      const { password, ...safeLobby } = lobby
      return {
        ...safeLobby,
        isPrivate: !!password,
      }
    })

    return NextResponse.json(
      {
        lobbies: sanitizedLobbies,
        stats
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  } catch (error) {
    log.error('Get lobbies error', error as Error, {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })

    // Return empty array instead of error to prevent UI from breaking
    return NextResponse.json(
      {
        lobbies: [],
        stats: {
          totalLobbies: 0,
          waitingLobbies: 0,
          playingLobbies: 0,
          totalPlayers: 0,
        },
        error: 'Failed to load lobbies. Please try again.',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    )
  }
}
