import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { createGameEngine, DEFAULT_GAME_TYPE, isSupportedGameType } from '@/lib/game-registry'
import { getGameMetadata as getCatalogGameMetadata, isAvailableGameType } from '@/lib/game-catalog'
import { LOBBY_THEME_IDS } from '@/lib/lobby-themes'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { sanitizeLobbyCreatorIdentity, sanitizeLobbyUserIdentity } from '@/lib/lobby-response'
import { type RestorableGameState } from '@/lib/game-engine'
import { TelephoneDoodleGame } from '@/lib/games/telephone-doodle-game'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { FakeArtistGame } from '@/lib/games/fake-artist-game'
import { AliasGame } from '@/lib/games/alias'
import { sanitizeSpyStateForBroadcast } from '@/lib/games/spy-game'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import {
  hashLobbyPassword,
  isHashedLobbyPassword,
  verifyLobbyPassword,
} from '@/lib/lobby-password'
import { toPersistedGameType } from '@/lib/game-type-storage'
import {
  parsePersistedGameState,
  stringifyPersistedGameState,
  toPersistedGameStateInput,
} from '@/lib/persisted-game-state'

const gameLimiter = rateLimit(rateLimitPresets.game)
const UNLIMITED_SPECTATORS_VALUE = 0
const MAX_JOIN_SERIALIZABLE_RETRIES = 2

class LobbyFullError extends Error {
  constructor() {
    super('Lobby is full')
    this.name = 'LobbyFullError'
  }
}

function resolveTurnTimerSeconds(turnTimer: unknown): number {
  if (typeof turnTimer !== 'number' || !Number.isFinite(turnTimer)) return 0
  return Math.max(0, Math.floor(turnTimer))
}

function resolveLastMoveAtDate(lastMoveAt: unknown): Date | undefined {
  if (typeof lastMoveAt === 'number' && Number.isFinite(lastMoveAt)) {
    return new Date(lastMoveAt)
  }
  return undefined
}

type TimeoutActiveGame = {
  id: string
  updatedAt: Date
  state: unknown
  status: string
  lastMoveAt?: Date | null
  players: unknown
}

async function commitTimeoutFallback(params: {
  activeGame: TimeoutActiveGame
  nextState: { status: string; lastMoveAt?: unknown; players?: unknown[] }
  actionType: string
  actionPayload: Record<string, unknown>
  lobbyCode: string
  gameSocketEvent?: string
  gameSocketData?: Record<string, unknown>
}): Promise<void> {
  const { activeGame, nextState, actionType, actionPayload, lobbyCode, gameSocketEvent, gameSocketData } = params
  const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

  const updateResult = await prisma.games.updateMany({
    where: { id: activeGame.id, updatedAt: activeGame.updatedAt },
    data: {
      state: toPersistedGameStateInput(nextState),
      status: nextState.status as 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled',
      ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
      updatedAt: new Date(),
    },
  })

  if (updateResult.count === 0) return

  type ActiveScorePlayer = { id: string; userId: string; score: number }
  const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
  const activePlayers: ActiveScorePlayer[] = (Array.isArray(activeGame.players) ? activeGame.players as Record<string, unknown>[] : [])
    .map((entry) => ({
      id: typeof entry?.id === 'string' ? entry.id : '',
      userId: typeof entry?.userId === 'string' ? entry.userId : '',
      score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
    }))
    .filter((entry) => entry.id.length > 0 && entry.userId.length > 0)
  const activePlayersByUserId = new Map(activePlayers.map((p) => [p.userId, p]))

  const scoreUpdates: Array<Promise<unknown>> = []
  for (const statePlayer of statePlayers) {
    if (!statePlayer || typeof statePlayer !== 'object') continue
    const statePlayerId = (statePlayer as { id?: unknown }).id
    if (typeof statePlayerId !== 'string') continue
    const dbPlayer = activePlayersByUserId.get(statePlayerId)
    if (!dbPlayer) continue
    const rawScore = (statePlayer as { score?: unknown }).score
    const nextScore = typeof rawScore === 'number' && Number.isFinite(rawScore) ? Math.floor(rawScore) : 0
    if (dbPlayer.score === nextScore) continue
    scoreUpdates.push(prisma.players.update({ where: { id: dbPlayer.id }, data: { score: nextScore } }))
    dbPlayer.score = nextScore
  }
  if (scoreUpdates.length > 0) await Promise.all(scoreUpdates)

  activeGame.state = JSON.stringify(nextState)
  activeGame.status = nextState.status
  if (lastMoveAtDate) activeGame.lastMoveAt = lastMoveAtDate

  await appendGameReplaySnapshot({
    gameId: activeGame.id,
    playerId: null,
    actionType,
    actionPayload: { source: 'lobby-get', ...actionPayload },
    state: nextState,
  })

  if (gameSocketEvent && gameSocketData) {
    void broadcastToLobby(lobbyCode, gameSocketEvent, {
      action: 'timeout-fallback',
      playerId: null,
      data: gameSocketData,
      state: nextState,
    })
  }

  void broadcastToLobby(lobbyCode, 'game-update', {
    action: 'state-change',
    payload: { state: nextState },
  })
}

const updateLobbySettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(10).optional(),
    turnTimer: z.number().int().min(30).max(180).optional(),
    allowSpectators: z.boolean().optional(),
    maxSpectators: z.number().int().min(0).max(100).optional(),
    theme: z.string().optional(),
    gameType: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting must be provided',
  })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResult = await gameLimiter(request)
    if (rateLimitResult) return rateLimitResult

    const { searchParams } = new URL(request.url)
    const includeFinished = searchParams.get('includeFinished') === 'true'
    const { code } = await params

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        maxPlayers: true,
        allowSpectators: true,
        maxSpectators: true,
        spectatorCount: true,
        turnTimer: true,
        isActive: true,
        gameType: true,
        theme: true,
        createdAt: true,
        creatorId: true,
        password: true,
        creator: {
          select: {
            id: true,
            username: true,
          },
        },
        games: {
          where: {
            status: {
              in: includeFinished
                ? ['waiting', 'playing', 'finished', 'abandoned', 'cancelled']
                : ['waiting', 'playing'],
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            players: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    isGuest: true,
                    image: true,
                    avatarUrl: true,
                    premiumUntil: true,
                    bot: {
                      select: {
                        difficulty: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    const { password, ...safeLobby } = lobby
    const activeGame = pickRelevantLobbyGame(safeLobby.games, { includeFinished })

    if (
      activeGame &&
      activeGame.status === 'playing' &&
      (safeLobby.gameType || activeGame.gameType) === 'telephone_doodle'
    ) {
      const turnTimerSeconds = resolveTurnTimerSeconds(safeLobby.turnTimer)
      if (turnTimerSeconds > 0) {
        try {
          const parsedState = parsePersistedGameState<RestorableGameState>(activeGame.state)
          const telephoneGame = new TelephoneDoodleGame(activeGame.id)
          telephoneGame.restoreState(parsedState)
          const r = telephoneGame.applyTimeoutFallback(turnTimerSeconds)
          if (r.changed) {
            await commitTimeoutFallback({
              activeGame,
              nextState: telephoneGame.getState(),
              actionType: 'telephone_doodle:timeout-fallback',
              actionPayload: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoSubmittedSteps: r.autoSubmittedSteps,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
              lobbyCode: safeLobby.code,
              gameSocketEvent: 'telephone-doodle-action',
              gameSocketData: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoSubmittedSteps: r.autoSubmittedSteps,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
            })
          }
        } catch (error) {
          const log = apiLogger('GET /api/lobby/[code]')
          log.warn('Telephone Doodle timeout fallback on lobby GET failed', {
            code,
            gameId: activeGame.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    if (
      activeGame &&
      activeGame.status === 'playing' &&
      (safeLobby.gameType || activeGame.gameType) === 'liars_party'
    ) {
      const turnTimerSeconds = resolveTurnTimerSeconds(safeLobby.turnTimer)
      if (turnTimerSeconds > 0) {
        try {
          const parsedState = parsePersistedGameState<RestorableGameState>(activeGame.state)
          const liarsPartyGame = new LiarsPartyGame(activeGame.id)
          liarsPartyGame.restoreState(parsedState)

          const r = liarsPartyGame.applyTimeoutFallback(turnTimerSeconds)
          if (r.changed) {
            await commitTimeoutFallback({
              activeGame,
              nextState: liarsPartyGame.getState(),
              actionType: 'liars_party:timeout-fallback',
              actionPayload: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoSubmittedClaims: r.autoSubmittedClaims,
                autoSubmittedChallenges: r.autoSubmittedChallenges,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
              lobbyCode: safeLobby.code,
              gameSocketEvent: 'liars-party-action',
              gameSocketData: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoSubmittedClaims: r.autoSubmittedClaims,
                autoSubmittedChallenges: r.autoSubmittedChallenges,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
            })
          }
        } catch (error) {
          const log = apiLogger('GET /api/lobby/[code]')
          log.warn("Liar's Party timeout fallback on lobby GET failed", {
            code,
            gameId: activeGame.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    if (
      activeGame &&
      activeGame.status === 'playing' &&
      (safeLobby.gameType || activeGame.gameType) === 'fake_artist'
    ) {
      const turnTimerSeconds = resolveTurnTimerSeconds(safeLobby.turnTimer)
      if (turnTimerSeconds > 0) {
        try {
          const parsedState = parsePersistedGameState<RestorableGameState>(activeGame.state)
          const fakeArtistGame = new FakeArtistGame(activeGame.id)
          fakeArtistGame.restoreState(parsedState)

          const r = fakeArtistGame.applyTimeoutFallback(turnTimerSeconds)
          if (r.changed) {
            await commitTimeoutFallback({
              activeGame,
              nextState: fakeArtistGame.getState(),
              actionType: 'fake_artist:timeout-fallback',
              actionPayload: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoSubmittedStrokes: r.autoSubmittedStrokes,
                autoSubmittedVotes: r.autoSubmittedVotes,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
              lobbyCode: safeLobby.code,
              gameSocketEvent: 'fake-artist-action',
              gameSocketData: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoSubmittedStrokes: r.autoSubmittedStrokes,
                autoSubmittedVotes: r.autoSubmittedVotes,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
            })
          }
        } catch (error) {
          const log = apiLogger('GET /api/lobby/[code]')
          log.warn('Fake Artist timeout fallback on lobby GET failed', {
            code,
            gameId: activeGame.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    if (
      activeGame &&
      activeGame.status === 'playing' &&
      (safeLobby.gameType || activeGame.gameType) === 'alias'
    ) {
      const turnTimerSeconds = resolveTurnTimerSeconds(safeLobby.turnTimer)
      if (turnTimerSeconds > 0) {
        try {
          const parsedState = parsePersistedGameState<RestorableGameState>(activeGame.state)
          const aliasGame = new AliasGame(activeGame.id)
          aliasGame.restoreState(parsedState)

          const r = aliasGame.applyTimeoutFallback(turnTimerSeconds)
          if (r.changed) {
            await commitTimeoutFallback({
              activeGame,
              nextState: aliasGame.getState(),
              actionType: 'alias:timeout-fallback',
              actionPayload: {},
              lobbyCode: safeLobby.code,
            })
          }
        } catch (error) {
          const log = apiLogger('GET /api/lobby/[code]')
          log.warn('Alias timeout fallback on lobby GET failed', {
            code,
            gameId: activeGame.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    const activeGameType = safeLobby.gameType || activeGame?.gameType
    const sanitizedActiveGame = activeGame
      ? {
          ...activeGame,
          state: (() => {
            const parsed = parsePersistedGameState<{ data?: unknown; status?: string }>(activeGame.state)
            const safe = activeGameType === 'guess_the_spy'
              ? sanitizeSpyStateForBroadcast(parsed)
              : parsed
            return stringifyPersistedGameState(safe as Parameters<typeof stringifyPersistedGameState>[0])
          })(),
          players: Array.isArray(activeGame.players)
            ? activeGame.players.map((player) => {
                const safeUser = sanitizeLobbyUserIdentity(player?.user)
                return safeUser ? { ...player, user: safeUser } : player
              })
            : activeGame.players,
        }
      : null
    const { creator, ...safeLobbyWithoutCreator } = safeLobby
    const sanitizedCreator = sanitizeLobbyCreatorIdentity(creator)

    return NextResponse.json({
      lobby: {
        ...safeLobbyWithoutCreator,
        creator: sanitizedCreator,
        games: sanitizedActiveGame ? [sanitizedActiveGame] : [],
        activeGame: sanitizedActiveGame,
        isPrivate: !!password,
      },
      activeGame: sanitizedActiveGame,
      // Backward compatibility for older clients.
      game: sanitizedActiveGame,
    })
  } catch (error) {
    const log = apiLogger('GET /api/lobby/[code]')
    log.error('Get lobby error', error as Error, {
      code: (await params).code,
      stack: (error as Error).stack
    })
    return NextResponse.json({
      error: 'Internal server error',
      code: 'LOBBY_FETCH_FAILED',
    }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('POST /api/lobby/[code]')

  try {
    // Rate limit join requests
    const rateLimitResult = await gameLimiter(request)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params

    const requestUser = await getRequestAuthUser(request)
    if (!requestUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const userId = requestUser.id

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: { status: { in: ['waiting', 'playing'] } },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    // Check password if set
    const body = await request.json()
    if (lobby.password) {
      const providedPassword = typeof body?.password === 'string' ? body.password : undefined
      const isPasswordValid = await verifyLobbyPassword(lobby.password, providedPassword)

      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
      }

      // Upgrade legacy plain-text lobby passwords after a successful match.
      if (!isHashedLobbyPassword(lobby.password)) {
        const upgradedHash = await hashLobbyPassword(providedPassword)
        if (upgradedHash) {
          try {
            await prisma.lobbies.update({
              where: { id: lobby.id },
              data: { password: upgradedHash },
            })
          } catch (upgradeError) {
            log.warn('Failed to upgrade legacy lobby password hash', {
              lobbyId: lobby.id,
              error: (upgradeError as Error).message,
            })
          }
        }
      }
    }

    // Pre-compute initial game state outside the transaction (pure computation, no DB)
    const requestedGameType = lobby.gameType || DEFAULT_GAME_TYPE
    if (!isSupportedGameType(requestedGameType)) {
      return NextResponse.json({ error: 'Unsupported lobby game type' }, { status: 400 })
    }
    const runtimeGameType = requestedGameType
    const initialState = createGameEngine(runtimeGameType, 'temp').getState()

    let game: { id: string; status: string } | undefined = undefined
    let player: Prisma.PlayersGetPayload<{ include: { user: { select: { id: true; username: true; isGuest: true } } } }>
    let attempt = 0

    while (true) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            // Find or create waiting game atomically inside the transaction
            // to prevent concurrent requests from creating duplicate games.
            let activeGame = await tx.games.findFirst({
              where: { lobbyId: lobby.id, status: 'waiting' },
              select: { id: true, status: true },
            })

            if (!activeGame) {
              activeGame = await tx.games.create({
                data: {
                  lobbyId: lobby.id,
                  gameType: toPersistedGameType(runtimeGameType),
                  state: toPersistedGameStateInput(initialState),
                  status: 'waiting',
                },
                select: { id: true, status: true },
              })
            }

            // Return early if player already joined
            const existingPlayer = await tx.players.findUnique({
              where: { gameId_userId: { gameId: activeGame.id, userId } },
            })
            if (existingPlayer) {
              await tx.lobbyInvites.updateMany({
                where: { lobbyId: lobby.id, inviteeId: userId, acceptedAt: null },
                data: { acceptedAt: new Date() },
              })
              return { game: activeGame, player: existingPlayer, alreadyJoined: true }
            }

            const playerCount = await tx.players.count({ where: { gameId: activeGame.id } })
            if (playerCount >= lobby.maxPlayers) {
              throw new LobbyFullError()
            }

            const newPlayer = await tx.players.create({
              data: {
                gameId: activeGame.id,
                userId: userId,
                position: playerCount,
                scorecard: JSON.stringify({}),
              },
              include: {
                user: { select: { id: true, username: true, isGuest: true } },
              },
            })

            return { game: activeGame, player: newPlayer, alreadyJoined: false }
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )

        game = result.game
        player = result.player as Prisma.PlayersGetPayload<{ include: { user: { select: { id: true; username: true; isGuest: true } } } }>

        if (result.alreadyJoined) {
          return NextResponse.json({ game, player })
        }

        break
      } catch (error) {
        if (error instanceof LobbyFullError) {
          return NextResponse.json(
            { error: 'Lobby is full' },
            { status: 400 }
          )
        }

        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < MAX_JOIN_SERIALIZABLE_RETRIES
        ) {
          attempt += 1
          continue
        }

        throw error
      }
    }

    // Broadcast player-joined — includes username not available via Postgres Changes
    void broadcastToLobby(code, 'player-joined', {
      username: player.user.username || 'Player',
      userId: userId,
      isGuest: player.user.isGuest,
    })
    // lobby-update is handled by Postgres Changes on Lobbies table

    await prisma.lobbyInvites.updateMany({
      where: {
        lobbyId: lobby.id,
        inviteeId: userId,
        acceptedAt: null,
      },
      data: {
        acceptedAt: new Date(),
      },
    })

    return NextResponse.json({ game, player })
  } catch (error) {
    log.error('Join lobby error', error as Error, {
      code: (await params).code,
      stack: (error as Error).stack
    })
    return NextResponse.json({
      error: 'Internal server error',
      code: 'LOBBY_JOIN_FAILED',
    }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('PATCH /api/lobby/[code]')

  try {
    const rateLimitResult = await gameLimiter(request)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params
    const requestUser = await getRequestAuthUser(request)
    if (!requestUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json()
    const parsedBody = updateLobbySettingsSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid settings payload', details: parsedBody.error.flatten() },
        { status: 400 }
      )
    }

    const lobby = await prisma.lobbies.findUnique({
      where: { code },
      include: {
        games: {
          where: { status: { in: ['waiting', 'playing'] } },
          orderBy: { updatedAt: 'desc' },
          include: {
            players: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.creatorId !== requestUser.id) {
      return NextResponse.json(
        { error: 'Only lobby creator can update settings' },
        { status: 403 }
      )
    }

    const activeGame = pickRelevantLobbyGame(lobby.games)
    if (activeGame?.status === 'playing') {
      return NextResponse.json(
        { error: 'Lobby settings cannot be changed after game start' },
        { status: 409 }
      )
    }

    const updates = parsedBody.data

    // Validate theme if provided
    if (typeof updates.theme === 'string' && !LOBBY_THEME_IDS.includes(updates.theme as typeof LOBBY_THEME_IDS[number])) {
      return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    }

    // Validate gameType if provided
    if (typeof updates.gameType === 'string' && !isAvailableGameType(updates.gameType)) {
      return NextResponse.json({ error: 'Game type is not available' }, { status: 400 })
    }

    const effectiveGameType = updates.gameType ?? lobby.gameType ?? DEFAULT_GAME_TYPE
    const gameMetadata = getCatalogGameMetadata(effectiveGameType)
    const minAllowedPlayers = Math.max(2, gameMetadata?.minPlayers ?? 2)
    const maxAllowedPlayers = Math.min(10, gameMetadata?.maxPlayers ?? 10)
    const activePlayerCount = Array.isArray(activeGame?.players) ? activeGame.players.length : 0

    if (typeof updates.maxPlayers === 'number') {
      if (updates.maxPlayers < minAllowedPlayers) {
        return NextResponse.json(
          {
            error: `Min players for this game is ${minAllowedPlayers}`,
          },
          { status: 400 }
        )
      }

      if (updates.maxPlayers > maxAllowedPlayers) {
        return NextResponse.json(
          {
            error: `Max players for this game is ${maxAllowedPlayers}`,
          },
          { status: 400 }
        )
      }

      if (updates.maxPlayers < activePlayerCount) {
        return NextResponse.json(
          {
            error: `Current player count is ${activePlayerCount}, cannot set lower max players`,
          },
          { status: 400 }
        )
      }
    }

    // When switching game type, clamp maxPlayers to new game's bounds
    let clampedMaxPlayers: number | undefined
    if (typeof updates.gameType === 'string' && updates.gameType !== lobby.gameType) {
      const currentMax = typeof updates.maxPlayers === 'number' ? updates.maxPlayers : lobby.maxPlayers
      const clamped = Math.min(maxAllowedPlayers, Math.max(minAllowedPlayers, currentMax))
      if (clamped !== lobby.maxPlayers || typeof updates.maxPlayers === 'number') {
        clampedMaxPlayers = clamped
      }
    }

    const updatedLobby = await prisma.lobbies.update({
      where: { id: lobby.id },
      data: {
        ...(typeof updates.maxPlayers === 'number' ? { maxPlayers: updates.maxPlayers } : clampedMaxPlayers !== undefined ? { maxPlayers: clampedMaxPlayers } : {}),
        ...(typeof updates.turnTimer === 'number' ? { turnTimer: updates.turnTimer } : {}),
        ...(typeof updates.allowSpectators === 'boolean'
          ? {
              allowSpectators: updates.allowSpectators,
              maxSpectators: updates.allowSpectators ? UNLIMITED_SPECTATORS_VALUE : 0,
            }
          : {}),
        ...(typeof updates.maxSpectators === 'number' && updates.allowSpectators !== false
          ? { maxSpectators: updates.maxSpectators }
          : {}),
        ...(typeof updates.theme === 'string' ? { theme: updates.theme } : {}),
        ...(typeof updates.gameType === 'string' ? { gameType: updates.gameType } : {}),
      },
      select: {
        id: true,
        code: true,
        maxPlayers: true,
        allowSpectators: true,
        maxSpectators: true,
        turnTimer: true,
        theme: true,
        gameType: true,
      },
    })

    // If game type changed, also update the waiting game record
    if (typeof updates.gameType === 'string' && updates.gameType !== lobby.gameType && activeGame) {
      await prisma.games.update({
        where: { id: activeGame.id },
        data: { gameType: toPersistedGameType(updates.gameType) },
      })
    }

    // Postgres Changes on Lobbies table broadcasts the settings update automatically
    log.info('Lobby settings updated', {
      code,
      updaterId: requestUser.id,
      updates,
      maxPlayers: updatedLobby.maxPlayers,
      turnTimer: updatedLobby.turnTimer,
      allowSpectators: updatedLobby.allowSpectators,
      theme: updatedLobby.theme,
      gameType: updatedLobby.gameType,
    })

    return NextResponse.json({ success: true, lobby: updatedLobby })
  } catch (error) {
    log.error('Update lobby settings error', error as Error, {
      code: (await params).code,
    })
    return NextResponse.json(
      {
        error: 'Failed to update lobby settings',
        code: 'LOBBY_UPDATE_FAILED',
      },
      { status: 500 }
    )
  }
}
