import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { notifySocket } from '@/lib/socket-url'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { createGameEngine, DEFAULT_GAME_TYPE, isSupportedGameType } from '@/lib/game-registry'
import { getGameMetadata as getCatalogGameMetadata } from '@/lib/game-catalog'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { sanitizeLobbyCreatorIdentity, sanitizeLobbyUserIdentity } from '@/lib/lobby-response'
import { type RestorableGameState } from '@/lib/game-engine'
import { TelephoneDoodleGame } from '@/lib/games/telephone-doodle-game'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { FakeArtistGame } from '@/lib/games/fake-artist-game'
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

const apiLimiter = rateLimit(rateLimitPresets.api)
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

const updateLobbySettingsSchema = z
  .object({
    maxPlayers: z.number().int().min(2).max(10).optional(),
    turnTimer: z.number().int().min(30).max(180).optional(),
    allowSpectators: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one setting must be provided',
  })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    // Rate limit GET requests
    const rateLimitResult = await apiLimiter(request)
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

          const timeoutResolution = telephoneGame.applyTimeoutFallback(turnTimerSeconds)
          if (timeoutResolution.changed) {
            const nextState = telephoneGame.getState()
            const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

            const updateResult = await prisma.games.updateMany({
              where: {
                id: activeGame.id,
                updatedAt: activeGame.updatedAt,
              },
              data: {
                state: toPersistedGameStateInput(nextState),
                status: nextState.status,
                ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                updatedAt: new Date(),
              },
            })

            if (updateResult.count > 0) {
              const scoreUpdates: Array<Promise<unknown>> = []
              const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
              type ActiveScorePlayer = {
                id: string
                userId: string
                score: number
              }

              const activePlayers: ActiveScorePlayer[] = (Array.isArray(activeGame.players) ? activeGame.players : [])
                .map((entry: Record<string, unknown>) => ({
                  id: typeof entry?.id === 'string' ? entry.id : '',
                  userId: typeof entry?.userId === 'string' ? entry.userId : '',
                  score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
                }))
                .filter((entry: ActiveScorePlayer) => entry.id.length > 0 && entry.userId.length > 0)
              const activePlayersByUserId = new Map<string, ActiveScorePlayer>(
                activePlayers.map((entry: ActiveScorePlayer): [string, ActiveScorePlayer] => [entry.userId, entry])
              )

              for (const statePlayer of statePlayers) {
                if (!statePlayer || typeof statePlayer !== 'object') continue

                const statePlayerId = (statePlayer as { id?: unknown }).id
                if (typeof statePlayerId !== 'string') continue

                const dbPlayer = activePlayersByUserId.get(statePlayerId)
                if (!dbPlayer) continue

                const rawScore = (statePlayer as { score?: unknown }).score
                const nextScore =
                  typeof rawScore === 'number' && Number.isFinite(rawScore)
                    ? Math.floor(rawScore)
                    : 0

                if (dbPlayer.score === nextScore) continue

                scoreUpdates.push(
                  prisma.players.update({
                    where: { id: dbPlayer.id },
                    data: {
                      score: nextScore,
                    },
                  })
                )
                dbPlayer.score = nextScore
              }

              if (scoreUpdates.length > 0) {
                await Promise.all(scoreUpdates)
              }

              activeGame.state = JSON.stringify(nextState)
              activeGame.status = nextState.status
              if (lastMoveAtDate) {
                activeGame.lastMoveAt = lastMoveAtDate
              }

              await appendGameReplaySnapshot({
                gameId: activeGame.id,
                playerId: null,
                actionType: 'telephone_doodle:timeout-fallback',
                actionPayload: {
                  source: 'lobby-get',
                  timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
                  autoSubmittedSteps: timeoutResolution.autoSubmittedSteps,
                  autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
                },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'telephone-doodle-action', {
                action: 'timeout-fallback',
                playerId: null,
                data: {
                  timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
                  autoSubmittedSteps: timeoutResolution.autoSubmittedSteps,
                  autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
                },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'game-update', {
                action: 'state-change',
                payload: { state: nextState },
              })
            }
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

          const timeoutResolution = liarsPartyGame.applyTimeoutFallback(turnTimerSeconds)
          if (timeoutResolution.changed) {
            const nextState = liarsPartyGame.getState()
            const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

            const updateResult = await prisma.games.updateMany({
              where: {
                id: activeGame.id,
                updatedAt: activeGame.updatedAt,
              },
              data: {
                state: toPersistedGameStateInput(nextState),
                status: nextState.status,
                ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                updatedAt: new Date(),
              },
            })

            if (updateResult.count > 0) {
              const scoreUpdates: Array<Promise<unknown>> = []
              const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
              type ActiveScorePlayer = {
                id: string
                userId: string
                score: number
              }

              const activePlayers: ActiveScorePlayer[] = (Array.isArray(activeGame.players) ? activeGame.players : [])
                .map((entry: Record<string, unknown>) => ({
                  id: typeof entry?.id === 'string' ? entry.id : '',
                  userId: typeof entry?.userId === 'string' ? entry.userId : '',
                  score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
                }))
                .filter((entry: ActiveScorePlayer) => entry.id.length > 0 && entry.userId.length > 0)
              const activePlayersByUserId = new Map<string, ActiveScorePlayer>(
                activePlayers.map((entry: ActiveScorePlayer): [string, ActiveScorePlayer] => [entry.userId, entry])
              )

              for (const statePlayer of statePlayers) {
                if (!statePlayer || typeof statePlayer !== 'object') continue

                const statePlayerId = (statePlayer as { id?: unknown }).id
                if (typeof statePlayerId !== 'string') continue

                const dbPlayer = activePlayersByUserId.get(statePlayerId)
                if (!dbPlayer) continue

                const rawScore = (statePlayer as { score?: unknown }).score
                const nextScore =
                  typeof rawScore === 'number' && Number.isFinite(rawScore)
                    ? Math.floor(rawScore)
                    : 0

                if (dbPlayer.score === nextScore) continue

                scoreUpdates.push(
                  prisma.players.update({
                    where: { id: dbPlayer.id },
                    data: {
                      score: nextScore,
                    },
                  })
                )
                dbPlayer.score = nextScore
              }

              if (scoreUpdates.length > 0) {
                await Promise.all(scoreUpdates)
              }

              activeGame.state = JSON.stringify(nextState)
              activeGame.status = nextState.status
              if (lastMoveAtDate) {
                activeGame.lastMoveAt = lastMoveAtDate
              }

              await appendGameReplaySnapshot({
                gameId: activeGame.id,
                playerId: null,
                actionType: 'liars_party:timeout-fallback',
                actionPayload: {
                  source: 'lobby-get',
                  timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
                  autoSubmittedClaims: timeoutResolution.autoSubmittedClaims,
                  autoSubmittedChallenges: timeoutResolution.autoSubmittedChallenges,
                  autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
                },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'liars-party-action', {
                action: 'timeout-fallback',
                playerId: null,
                data: {
                  timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
                  autoSubmittedClaims: timeoutResolution.autoSubmittedClaims,
                  autoSubmittedChallenges: timeoutResolution.autoSubmittedChallenges,
                  autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
                },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'game-update', {
                action: 'state-change',
                payload: { state: nextState },
              })
            }
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

          const timeoutResolution = fakeArtistGame.applyTimeoutFallback(turnTimerSeconds)
          if (timeoutResolution.changed) {
            const nextState = fakeArtistGame.getState()
            const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

            const updateResult = await prisma.games.updateMany({
              where: {
                id: activeGame.id,
                updatedAt: activeGame.updatedAt,
              },
              data: {
                state: toPersistedGameStateInput(nextState),
                status: nextState.status,
                ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                updatedAt: new Date(),
              },
            })

            if (updateResult.count > 0) {
              const scoreUpdates: Array<Promise<unknown>> = []
              const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
              type ActiveScorePlayer = {
                id: string
                userId: string
                score: number
              }

              const activePlayers: ActiveScorePlayer[] = (Array.isArray(activeGame.players) ? activeGame.players : [])
                .map((entry: Record<string, unknown>) => ({
                  id: typeof entry?.id === 'string' ? entry.id : '',
                  userId: typeof entry?.userId === 'string' ? entry.userId : '',
                  score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
                }))
                .filter((entry: ActiveScorePlayer) => entry.id.length > 0 && entry.userId.length > 0)
              const activePlayersByUserId = new Map<string, ActiveScorePlayer>(
                activePlayers.map((entry: ActiveScorePlayer): [string, ActiveScorePlayer] => [entry.userId, entry])
              )

              for (const statePlayer of statePlayers) {
                if (!statePlayer || typeof statePlayer !== 'object') continue

                const statePlayerId = (statePlayer as { id?: unknown }).id
                if (typeof statePlayerId !== 'string') continue

                const dbPlayer = activePlayersByUserId.get(statePlayerId)
                if (!dbPlayer) continue

                const rawScore = (statePlayer as { score?: unknown }).score
                const nextScore =
                  typeof rawScore === 'number' && Number.isFinite(rawScore)
                    ? Math.floor(rawScore)
                    : 0

                if (dbPlayer.score === nextScore) continue

                scoreUpdates.push(
                  prisma.players.update({
                    where: { id: dbPlayer.id },
                    data: {
                      score: nextScore,
                    },
                  })
                )
                dbPlayer.score = nextScore
              }

              if (scoreUpdates.length > 0) {
                await Promise.all(scoreUpdates)
              }

              activeGame.state = JSON.stringify(nextState)
              activeGame.status = nextState.status
              if (lastMoveAtDate) {
                activeGame.lastMoveAt = lastMoveAtDate
              }

              await appendGameReplaySnapshot({
                gameId: activeGame.id,
                playerId: null,
                actionType: 'fake_artist:timeout-fallback',
                actionPayload: {
                  source: 'lobby-get',
                  timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
                  autoSubmittedStrokes: timeoutResolution.autoSubmittedStrokes,
                  autoSubmittedVotes: timeoutResolution.autoSubmittedVotes,
                  autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
                },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'fake-artist-action', {
                action: 'timeout-fallback',
                playerId: null,
                data: {
                  timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
                  autoSubmittedStrokes: timeoutResolution.autoSubmittedStrokes,
                  autoSubmittedVotes: timeoutResolution.autoSubmittedVotes,
                  autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
                },
                state: nextState,
              })

              await notifySocket(`lobby:${safeLobby.code}`, 'game-update', {
                action: 'state-change',
                payload: { state: nextState },
              })
            }
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

    const sanitizedActiveGame = activeGame
      ? {
          ...activeGame,
          state: stringifyPersistedGameState(activeGame.state),
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

    // Find or create active game
    let game = lobby.games.find((g) => g.status === 'waiting')

    if (!game) {
      // Create a new game with initial state from the game registry
      const requestedGameType = lobby.gameType || DEFAULT_GAME_TYPE
      if (!isSupportedGameType(requestedGameType)) {
        return NextResponse.json({ error: 'Unsupported lobby game type' }, { status: 400 })
      }
      const runtimeGameType = requestedGameType
      const engine = createGameEngine(runtimeGameType, 'temp')
      const initialState = engine.getState()

      game = await prisma.games.create({
        data: {
          lobbyId: lobby.id,
          gameType: toPersistedGameType(runtimeGameType),
          state: toPersistedGameStateInput(initialState),
          status: 'waiting',
        },
      })
    }

    // Check if player already joined
    const existingPlayer = await prisma.players.findUnique({
      where: {
        gameId_userId: {
          gameId: game.id,
          userId: userId,
        },
      },
    })

    if (existingPlayer) {
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
      return NextResponse.json({ game, player: existingPlayer })
    }

    let player: Prisma.PlayersGetPayload<{ include: { user: { select: { id: true; username: true; isGuest: true } } } }>
    let attempt = 0

    while (true) {
      try {
        player = await prisma.$transaction(
          async (tx) => {
            const playerCount = await tx.players.count({
              where: { gameId: game.id },
            })

            if (playerCount >= lobby.maxPlayers) {
              throw new LobbyFullError()
            }

            return tx.players.create({
              data: {
                gameId: game.id,
                userId: userId,
                position: playerCount,
                scorecard: JSON.stringify({}),
              },
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    isGuest: true,
                  },
                },
              },
            })
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
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

    // Notify all clients via WebSocket that a player joined
    await notifySocket(
      `lobby:${code}`,
      'player-joined',
      {
        username: player.user.username || 'Player',
        userId: userId,
        isGuest: player.user.isGuest,
      }
    )

    // Also send lobby-update event
    await notifySocket(
      `lobby:${code}`,
      'lobby-update',
      { lobbyCode: code }
    )

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
    const gameMetadata = getCatalogGameMetadata(lobby.gameType || DEFAULT_GAME_TYPE)
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

    const updatedLobby = await prisma.lobbies.update({
      where: { id: lobby.id },
      data: {
        ...(typeof updates.maxPlayers === 'number' ? { maxPlayers: updates.maxPlayers } : {}),
        ...(typeof updates.turnTimer === 'number' ? { turnTimer: updates.turnTimer } : {}),
        ...(typeof updates.allowSpectators === 'boolean'
          ? {
              allowSpectators: updates.allowSpectators,
              maxSpectators: updates.allowSpectators ? UNLIMITED_SPECTATORS_VALUE : 0,
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        maxPlayers: true,
        allowSpectators: true,
        maxSpectators: true,
        turnTimer: true,
      },
    })

    await notifySocket(`lobby:${code}`, 'lobby-update', { lobbyCode: code })

    log.info('Lobby settings updated', {
      code,
      updaterId: requestUser.id,
      updates,
      maxPlayers: updatedLobby.maxPlayers,
      turnTimer: updatedLobby.turnTimer,
      allowSpectators: updatedLobby.allowSpectators,
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
