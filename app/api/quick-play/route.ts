import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma, GameType } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { apiLogger } from '@/lib/logger'
import { createGameEngine } from '@/lib/game-registry'
import { hasBotSupport, getAvailableGameTypes, isAvailableGameType, isSupportedGameType } from '@/lib/game-catalog'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { checkOpenLobbyLimit } from '@/lib/lobby-limit'
import { generateLobbyCode, isLobbyCodeConflict } from '@/lib/lobby'
import { toPersistedGameType } from '@/lib/game-type-storage'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { broadcastToLobby } from '@/lib/supabase-server'
import { getBotDisplayName, normalizeBotDifficulty } from '@/lib/bot-profiles'
import { getOrCreateBotUser, isPrismaUniqueConstraintError } from '@/lib/bot-helpers'
import { resolveBotTarget } from '@/lib/quick-play'
import { recordLobbyParticipation } from '@/lib/lobby-participation'
import { getSignupSourceFromRequest } from '@/lib/signup-source'

const log = apiLogger('/api/quick-play')

const QUICK_PLAY_GAME_TYPES = getAvailableGameTypes()

const quickPlaySchema = z.object({
  gameType: z.string().refine(
    (v) => isSupportedGameType(v),
    { message: `gameType must be one of: ${QUICK_PLAY_GAME_TYPES.join(', ')}` }
  ),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
  forceSolo: z.boolean().optional().default(false),
})

const apiLimiter = rateLimit(rateLimitPresets.api)
const MAX_CODE_ATTEMPTS = 10
// Quick-play lobbies get a faster turn timer than the 60s schema default (#779)
const QUICK_PLAY_TURN_TIMER_SECONDS = 45

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

    void broadcastToLobby(lobbyCode, 'player-joined', {
      lobbyCode,
      username: botUser.username || botDisplayName,
      userId: botUser.id,
      isBot: true,
    })
  }
  // lobby-update handled by Postgres Changes on Lobbies table
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

  if (!isAvailableGameType(gameType) || isTemporarilyUnavailableGameType(gameType)) {
    return NextResponse.json({ error: 'This game is temporarily unavailable' }, { status: 400 })
  }

  // Games without bot support still work via matchmaking (join-or-create),
  // but can't be started solo — nobody would ever fill the lobby.
  const supportsBots = hasBotSupport(gameType)
  if (forceSolo && !supportsBots) {
    return NextResponse.json({ error: 'This game does not support bots' }, { status: 400 })
  }

  log.info('Quick play request', { userId: user.id, gameType, difficulty, forceSolo })

  // Quick Play is the busiest entry and never wrote LobbyParticipations, so its
  // acquisition source was invisible (#920). Same cookie the account was created with.
  const signupSource = getSignupSourceFromRequest(req)

  // --- Step 1: find best open lobby (skipped when forceSolo=true) ---
  if (!forceSolo) {
    const openLobbies = await prisma.lobbies.findMany({
      where: {
        isActive: true,
        gameType: gameType as GameType,
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

          // Outside the transaction on purpose: an analytics write must never
          // roll back or delay someone joining a game (#816).
          await recordLobbyParticipation({
            lobbyId: target.id,
            lobbyCode: target.code,
            gameType: target.gameType,
            userId: user.id,
            isGuest: user.isGuest,
            signupSource,
          })

          void broadcastToLobby(target.code, 'player-joined', {
            lobbyCode: target.code,
            username: user.username || 'Player',
            userId: user.id,
          })
          // lobby-update handled by Postgres Changes on Lobbies table

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
  // Quick-play defaults tuned for fast sessions (#779): 45s turns, and
  // yahtzee starts in short mode (lower section, 9 rounds).
  const quickPlayEngineConfig =
    (gameType as string) === 'yahtzee' ? { rules: { mode: 'short' } } : undefined
  const engine = createGameEngine(gameType, 'quick_play_init', quickPlayEngineConfig)
  const initialState = engine.getState()
  const persistedGameType = toPersistedGameType(gameType)
  const minPlayers = engine.getConfig().minPlayers
  // The same one-open-lobby rule as POST /api/lobby (#907) — and this is the
  // route the reported case actually came through: four simultaneous bot games
  // from one guest, every one of them a Play vs Bot quick-play.
  const limit = await checkOpenLobbyLimit(user.id)
  if (limit.kind === 'blocked') {
    return NextResponse.json(
      {
        error: 'You already have a game open',
        code: 'LOBBY_ALREADY_OPEN',
        lobbyCode: limit.lobbyCode,
      },
      { status: 409 }
    )
  }

  const maxPlayers = engine.getConfig().maxPlayers

  let newCode: string | null = null
  let newLobbyId: string | null = null
  let gameId: string | null = null

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateLobbyCode({ fallbackToAlphanumeric: attempt >= 5 })
    const lobbyName = `Quick Play ${code}`

    try {
      const created = await prisma.lobbies.create({
        data: {
          code,
          name: lobbyName,
          maxPlayers,
          turnTimer: QUICK_PLAY_TURN_TIMER_SECONDS,
          gameType: gameType as GameType,
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
          id: true,
          code: true,
          games: {
            select: { id: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      })
      newCode = created.code
      newLobbyId = created.id
      gameId = created.games[0]?.id ?? null
      break
    } catch (err) {
      if (isLobbyCodeConflict(err)) {
        continue
      }
      throw err
    }
  }

  if (!newCode || !newLobbyId || !gameId) {
    log.error('Quick play: failed to create lobby', new Error('code-generation-failed'))
    return NextResponse.json({ error: 'Failed to create lobby' }, { status: 503 })
  }

  await recordLobbyParticipation({
    lobbyId: newLobbyId,
    lobbyCode: newCode,
    gameType: persistedGameType,
    userId: user.id,
    isGuest: user.isGuest,
    signupSource,
  })

  if (supportsBots) {
    // Fill with bots (1 human already in, need botTarget - 1 bots) — see
    // resolveBotTarget for why this isn't always just minPlayers.
    const botTarget = resolveBotTarget(minPlayers, forceSolo)
    try {
      await fillWithBots(newCode, gameId, gameType, 1, botTarget, user.id, difficulty)
    } catch (err) {
      log.error('Quick play: bot fill failed', err as Error)
      // Non-fatal — user is still in the lobby
    }
  }

  log.info('Quick play: created new lobby', {
    userId: user.id,
    lobbyCode: newCode,
    gameType,
    botFilled: supportsBots,
  })

  return NextResponse.json({ lobbyCode: newCode, isNew: true })
}
