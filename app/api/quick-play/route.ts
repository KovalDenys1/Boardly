import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { apiLogger } from '@/lib/logger'
import { createGameEngine } from '@/lib/game-registry'
import { hasBotSupport, getBotSupportedGameTypes, isSupportedGameType } from '@/lib/game-catalog'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { generateLobbyCode } from '@/lib/lobby'
import { toPersistedGameType } from '@/lib/game-type-storage'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { notifySocket } from '@/lib/socket-url'
import { getBotDisplayName, normalizeBotDifficulty } from '@/lib/bot-profiles'
import { getOrCreateBotUser, isPrismaUniqueConstraintError } from '@/lib/bot-helpers'

const log = apiLogger('/api/quick-play')

const QUICK_PLAY_GAME_TYPES = getBotSupportedGameTypes()

const quickPlaySchema = z.object({
  gameType: z.string().refine(
    (v) => isSupportedGameType(v) && hasBotSupport(v),
    { message: `gameType must be one of: ${QUICK_PLAY_GAME_TYPES.join(', ')}` }
  ),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  forceSolo: z.boolean().optional().default(false),
})

const apiLimiter = rateLimit(rateLimitPresets.api)
const MAX_CODE_ATTEMPTS = 10
const MAX_JOIN_RETRIES = 2

async function fillWithBots(
  lobbyCode: string,
  gameId: string,
  gameType: string,
  currentPlayerCount: number,
  minPlayers: number,
  creatorId: string,
  difficulty: 'easy' | 'medium' | 'hard' = 'medium'
) {
  const botsNeeded = Math.max(0, minPlayers - currentPlayerCount)
  for (let i = 0; i < botsNeeded; i++) {
    const normalizedDifficulty = normalizeBotDifficulty(difficulty)
    const baseName = getBotDisplayName(gameType, normalizedDifficulty)
    const botDisplayName = i > 0 ? `${baseName} ${i + 1}` : baseName

    const botUser = await getOrCreateBotUser(botDisplayName, gameType, normalizedDifficulty)

    try {
      await prisma.players.create({
        data: {
          gameId,
          userId: botUser.id,
          position: currentPlayerCount + i,
          isReady: true,
          score: 0,
        },
      })
    } catch (err) {
      if (!isPrismaUniqueConstraintError(err)) throw err
    }

    await notifySocket(`lobby:${lobbyCode}`, 'player-joined', {
      lobbyCode,
      username: botUser.username || botDisplayName,
      userId: botUser.id,
      isBot: true,
    })
  }

  if (botsNeeded > 0) {
    await notifySocket(`lobby:${lobbyCode}`, 'lobby-update', {
      lobbyCode,
      type: 'player-joined',
    })
  }
}

export async function POST(req: NextRequest) {
  const rateLimitResult = await apiLimiter(req)
  if (rateLimitResult) return rateLimitResult

  const user = await getRequestAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = quickPlaySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid gameType' }, { status: 400 })
  }

  const { gameType, difficulty, forceSolo } = parsed.data

  if (!hasBotSupport(gameType)) {
    return NextResponse.json({ error: 'Bot support required for Quick Play' }, { status: 400 })
  }

  if (isTemporarilyUnavailableGameType(gameType)) {
    return NextResponse.json({ error: 'This game is temporarily unavailable' }, { status: 400 })
  }

  log.info('Quick play request', { userId: user.id, gameType, difficulty, forceSolo })

  // --- Step 1: find best open lobby (skipped when forceSolo=true) ---
  if (!forceSolo) {
    const openLobbies = await prisma.lobbies.findMany({
      where: {
        isActive: true,
        gameType,
        password: null,
        games: {
          some: {
            status: 'waiting',
            players: {
              none: { userId: user.id },
            },
          },
        },
      },
      select: {
        id: true,
        code: true,
        name: true,
        maxPlayers: true,
        gameType: true,
        creatorId: true,
        createdAt: true,
        games: {
          where: { status: 'waiting' },
          select: {
            id: true,
            status: true,
            createdAt: true,
            _count: { select: { players: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    // Pick lobby with most players that still has room (closest to starting)
    const candidates = openLobbies
      .filter((lobby) => {
        const game = lobby.games[0]
        if (!game) return false
        return game._count.players < lobby.maxPlayers
      })
      .sort((a, b) => {
        const aCount = a.games[0]?._count?.players ?? 0
        const bCount = b.games[0]?._count?.players ?? 0
        return bCount - aCount
      })

    if (candidates.length > 0) {
      const target = candidates[0]
      const game = target.games[0]

      // Try to join with serializable transaction to handle race
      for (let attempt = 0; attempt <= MAX_JOIN_RETRIES; attempt++) {
        try {
          await prisma.$transaction(
            async (tx) => {
              const count = await tx.players.count({ where: { gameId: game.id } })
              if (count >= target.maxPlayers) throw new Error('LOBBY_FULL')
              await tx.players.create({
                data: {
                  gameId: game.id,
                  userId: user.id,
                  position: count,
                  scorecard: JSON.stringify({}),
                },
              })
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
          )

          await notifySocket(`lobby:${target.code}`, 'player-joined', {
            lobbyCode: target.code,
            username: user.username || 'Player',
            userId: user.id,
          })
          await notifySocket(`lobby:${target.code}`, 'lobby-update', {
            lobbyCode: target.code,
            type: 'player-joined',
          })

          log.info('Quick play: joined existing lobby', {
            userId: user.id,
            lobbyCode: target.code,
          })

          return NextResponse.json({ lobbyCode: target.code, isNew: false })
        } catch (err) {
          const msg = err instanceof Error ? err.message : ''
          if (msg === 'LOBBY_FULL' && attempt < MAX_JOIN_RETRIES) continue
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2034' &&
            attempt < MAX_JOIN_RETRIES
          )
            continue
          // Lobby became unavailable — fall through to create new one
          break
        }
      }
    }
  }

  // --- Step 2: create new lobby + fill with bots ---
  const engine = createGameEngine(gameType, 'quick_play_init')
  const initialState = engine.getState()
  const persistedGameType = toPersistedGameType(gameType)
  const minPlayers = engine.getConfig().minPlayers

  let newCode: string | null = null
  let gameId: string | null = null

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateLobbyCode({ fallbackToAlphanumeric: attempt >= 5 })
    const lobbyName = `Quick Play ${code}`

    try {
      const created = await prisma.lobbies.create({
        data: {
          code,
          name: lobbyName,
          maxPlayers: minPlayers,
          gameType,
          creatorId: user.id,
          games: {
            create: {
              status: 'waiting',
              gameType: persistedGameType,
              state: toPersistedGameStateInput(initialState),
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
        select: {
          code: true,
          games: {
            select: { id: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })
      newCode = created.code
      gameId = created.games[0]?.id ?? null
      break
    } catch (err) {
      const prismaErr = err as { code?: string; meta?: { target?: unknown } }
      if (
        prismaErr?.code === 'P2002' &&
        String(prismaErr?.meta?.target).toLowerCase().includes('code')
      ) {
        continue
      }
      throw err
    }
  }

  if (!newCode || !gameId) {
    log.error('Quick play: failed to create lobby', new Error('code-generation-failed'))
    return NextResponse.json({ error: 'Failed to create lobby' }, { status: 503 })
  }

  // Fill with bots (1 human already in, need minPlayers - 1 bots)
  try {
    await fillWithBots(newCode, gameId, gameType, 1, minPlayers, user.id, difficulty)
  } catch (err) {
    log.error('Quick play: bot fill failed', err as Error)
    // Non-fatal — user is still in the lobby
  }

  log.info('Quick play: created new lobby with bots', {
    userId: user.id,
    lobbyCode: newCode,
    gameType,
  })

  return NextResponse.json({ lobbyCode: newCode, isNew: true })
}
