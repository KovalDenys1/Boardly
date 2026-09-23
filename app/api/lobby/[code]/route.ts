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
import { getFinishedGameHumanRoster } from '@/lib/lobby-series-transition'
import { sweepStalePlayers } from '@/lib/lobby-presence'
import { sanitizeLobbyCreatorIdentity, sanitizeLobbyUserIdentity } from '@/lib/lobby-response'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'
import { type RestorableGameState } from '@/lib/game-engine'
import { TelephoneDoodleGame } from '@/lib/games/telephone-doodle-game'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { FakeArtistGame } from '@/lib/games/fake-artist-game'
import { AliasGame } from '@/lib/games/alias'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { verifyLobbyPassword } from '@/lib/lobby-password'
import type { LobbyJoinRefusalCode } from '@/lib/lobby-join-errors'
import { buildPartyGameTerminalUpdate, type DbPlayerRecord } from '@/lib/game-persistence'
import { toPersistedGameType } from '@/lib/game-type-storage'
import {
  parsePersistedGameState,
  stringifyPersistedGameState,
  toPersistedGameStateInput,
} from '@/lib/persisted-game-state'
import { recordLobbyParticipation } from '@/lib/lobby-participation'
import { getSignupSourceFromRequest } from '@/lib/signup-source'

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
  startedAt?: Date | null
  lastMoveAt?: Date | null
  players: unknown
}

async function commitTimeoutFallback(params: {
  activeGame: TimeoutActiveGame
  nextState: { status: string; winner?: string | null; lastMoveAt?: unknown; players?: unknown[]; data?: unknown }
  actionType: string
  actionPayload: Record<string, unknown>
  lobbyCode: string
  gameType: string
  gameSocketEvent?: string
  gameSocketData?: Record<string, unknown>
}): Promise<void> {
  const { activeGame, nextState, actionType, actionPayload, lobbyCode, gameType, gameSocketEvent, gameSocketData } = params
  const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)
  // Captured before activeGame.status is mutated below — the achievement
  // gate needs the pre-write status to detect the transition into 'finished'.
  const previousStatus = activeGame.status

  // #729: a timeout fallback can be the write that transitions one of the
  // party games into 'finished' — it must set the terminal player fields too.
  const fallbackDbPlayers: DbPlayerRecord[] = (Array.isArray(activeGame.players) ? activeGame.players as Record<string, unknown>[] : [])
    .map((entry) => ({
      id: typeof entry?.id === 'string' ? entry.id : '',
      userId: typeof entry?.userId === 'string' ? entry.userId : '',
      score: typeof entry?.score === 'number' && Number.isFinite(entry.score) ? entry.score : 0,
      scorecard: typeof entry?.scorecard === 'string' ? entry.scorecard : null,
      finalScore: typeof entry?.finalScore === 'number' ? entry.finalScore : null,
      placement: typeof entry?.placement === 'number' ? entry.placement : null,
      isWinner: entry?.isWinner === true,
    }))
    .filter((entry) => entry.id.length > 0 && entry.userId.length > 0)
  const terminalUpdate = buildPartyGameTerminalUpdate({
    previousStatus: activeGame.status,
    state: nextState,
    startedAt: activeGame.startedAt ?? null,
    dbPlayers: fallbackDbPlayers,
  })

  const updateResult = await prisma.games.updateMany({
    where: { id: activeGame.id, updatedAt: activeGame.updatedAt },
    data: {
      state: toPersistedGameStateInput(nextState),
      status: nextState.status as 'waiting' | 'playing' | 'finished' | 'abandoned' | 'cancelled',
      ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
      ...(terminalUpdate ? terminalUpdate.terminalFields : {}),
      updatedAt: new Date(),
    },
  })

  if (updateResult.count === 0) return

  if (terminalUpdate) {
    // The terminal diff supersedes the plain score sync below — one update per
    // player carrying score + finalScore/placement/isWinner.
    await Promise.all(terminalUpdate.changedPlayerUpdates.map((update) =>
      prisma.players.update({
        where: { id: update.id },
        data: {
          score: update.score,
          scorecard: update.scorecard,
          finalScore: update.finalScore,
          placement: update.placement,
          isWinner: update.isWinner,
        },
      })
    ))
  }

  if (!terminalUpdate) {
    const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
    const activePlayersByUserId = new Map(fallbackDbPlayers.map((p) => [p.userId, p]))

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
  }

  // #759: the timeout fallback can be the write that finishes a game — it
  // previously ran terminal player fields (#729) but never achievement
  // checks, silently skipping unlocks for games ended by idle timeout.
  await checkAchievementsOnStatusChange(
    previousStatus,
    nextState.status,
    (Array.isArray(activeGame.players) ? activeGame.players as Array<Record<string, unknown>> : [])
      .filter((entry): entry is Record<string, unknown> & { userId: string } => typeof entry?.userId === 'string')
      .map((entry) => ({ userId: entry.userId, user: entry.user })),
    apiLogger('GET /api/lobby/[code]')
  )

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

  // No single viewer for a shared broadcast — strip any per-game hidden info
  // (e.g. Sketch & Guess's live prompt) for everyone. `nextState` itself
  // (used for persistence/replay above) is deliberately left untouched.
  const broadcastState = sanitizeStateForBroadcast(gameType, nextState, null)

  if (gameSocketEvent && gameSocketData) {
    void broadcastToLobby(lobbyCode, gameSocketEvent, {
      action: 'timeout-fallback',
      playerId: null,
      data: gameSocketData,
      state: broadcastState,
    })
  }

  void broadcastToLobby(lobbyCode, 'game-update', {
    action: 'state-change',
    payload: { state: broadcastState },
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
    // Optional — this route stays publicly readable for guests/spectators
    // with no session; resolved only so a signed-in viewer can see their own
    // not-yet-revealed data (e.g. Sketch & Guess's live prompt while
    // they're the drawer) via the sanitizer below.
    const requestUser = await getRequestAuthUser(request)

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

    // Zero-signal disconnect detection (#675) — opportunistic, no separate
    // cron. If it abandoned/deactivated the game we just loaded, the
    // per-game-type timeout-fallback checks below would otherwise still run
    // against a now-stale in-memory `activeGame.status === 'playing'` and
    // write a pointless update to an already-abandoned game — skip them for
    // this one request; the next GET picks up the corrected state.
    let presenceSweptGameAbandoned = false
    if (activeGame && (activeGame.status === 'playing' || activeGame.status === 'waiting')) {
      const log = apiLogger('GET /api/lobby/[code]')
      try {
        const sweepResult = await sweepStalePlayers(activeGame, code, log)
        presenceSweptGameAbandoned = sweepResult.gameAbandoned
        // Keep the in-memory object in sync with what was just committed —
        // matches the existing pattern below (commitTimeoutFallback mutates
        // activeGame.state directly) so this response reflects the sweep
        // instead of momentarily still showing an already-removed player.
        if (sweepResult.removedUserIds.length > 0) {
          activeGame.players = activeGame.players.filter(
            (p) => !sweepResult.removedUserIds.includes(p.userId)
          )
          if (presenceSweptGameAbandoned) {
            activeGame.status = 'abandoned'
          }
        }
      } catch (error) {
        log.warn('Stale-player sweep failed', {
          code,
          gameId: activeGame.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    if (
      activeGame &&
      !presenceSweptGameAbandoned &&
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
              gameType: 'telephone_doodle',
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
      !presenceSweptGameAbandoned &&
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
              gameType: 'liars_party',
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
      !presenceSweptGameAbandoned &&
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
              gameType: 'fake_artist',
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
      !presenceSweptGameAbandoned &&
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
              gameType: 'alias',
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

    if (
      activeGame &&
      !presenceSweptGameAbandoned &&
      activeGame.status === 'playing' &&
      (safeLobby.gameType || activeGame.gameType) === 'sketch_and_guess'
    ) {
      // #1022: no `turnTimerSeconds > 0` gate here, unlike the other four. This
      // game owns its own per-phase clocks, so a lobby created without a turn
      // timer still gets one — without that, a drawer who closed their tab
      // stalled the round until somebody reloaded.
      {
        try {
          const parsedState = parsePersistedGameState<RestorableGameState>(activeGame.state)
          const sketchGame = new SketchAndGuessGame(activeGame.id)
          sketchGame.restoreState(parsedState)

          const r = sketchGame.applyTimeoutFallback()
          if (r.changed) {
            await commitTimeoutFallback({
              activeGame,
              nextState: sketchGame.getState(),
              actionType: 'sketch_and_guess:timeout-fallback',
              actionPayload: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoPickedWords: r.autoPickedWords,
                autoSubmittedDrawings: r.autoSubmittedDrawings,
                autoSubmittedGuesses: r.autoSubmittedGuesses,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
              lobbyCode: safeLobby.code,
              gameType: 'sketch_and_guess',
              gameSocketEvent: 'sketch-and-guess-action',
              gameSocketData: {
                timeoutWindowsConsumed: r.timeoutWindowsConsumed,
                autoPickedWords: r.autoPickedWords,
                autoSubmittedDrawings: r.autoSubmittedDrawings,
                autoSubmittedGuesses: r.autoSubmittedGuesses,
                autoSubmittedPlayerIds: r.autoSubmittedPlayerIds,
              },
            })
          }
        } catch (error) {
          const log = apiLogger('GET /api/lobby/[code]')
          log.warn('Sketch & Guess timeout fallback on lobby GET failed', {
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
            const safe = sanitizeStateForBroadcast(activeGameType ?? '', parsed, requestUser?.id ?? null)
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
      // kickedUserIds is omitted globally (lib/db.ts); this route is one of the two that
      // has to honour it, so it asks for it back by name.
      omit: { kickedUserIds: false },
      include: {
        games: {
          where: { status: { in: ['waiting', 'playing'] } },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    // A kick has to hold, and it is checked before the password so that knowing the password
    // is not a way back in. Without this the host's only moderation tool was a row delete the
    // player walked straight back through — re-opening the invite link was enough, because
    // the public-lobby auto-join fires on a fresh mount with no click from them (#1013).
    if (lobby.kickedUserIds.includes(userId)) {
      return NextResponse.json(
        { error: 'The host removed you from this lobby', code: 'KICKED_FROM_LOBBY' },
        { status: 403 }
      )
    }

    // Check password if set
    const body = await request.json()
    if (lobby.password) {
      const providedPassword = typeof body?.password === 'string' ? body.password : undefined
      const isPasswordValid = await verifyLobbyPassword(lobby.password, providedPassword)

      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
      }
    }

    // A running game does not take newcomers (#879). The transaction below looks for a
    // `waiting` game and creates one when it finds none, so without this a latecomer got
    // a second active game beside the running one — and `pickRelevantLobbyGame` prefers
    // `playing`, so they sat in a waiting game nobody could start. Players of the running
    // game still get through: the transaction's `alreadyJoined` path is what rejoin uses.
    const playingGame = lobby.games.find((g) => g.status === 'playing')
    if (playingGame) {
      const alreadyPlaying = await prisma.players.findUnique({
        where: { gameId_userId: { gameId: playingGame.id, userId } },
        select: { id: true },
      })
      if (!alreadyPlaying) {
        return NextResponse.json(
          {
            error: 'Game in progress',
            code: 'GAME_IN_PROGRESS' satisfies LobbyJoinRefusalCode,
            allowSpectators: lobby.allowSpectators,
          },
          { status: 409 }
        )
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
              // The room the newcomer opens has to be the room the previous match is
              // sitting in. Created bare, it outranks the finished game everyone is
              // still looking at, and they were all pulled into an empty board holding
              // only the newcomer (#1005). Same roster carry-over as "Return to lobby".
              const carriedUserIds = await getFinishedGameHumanRoster(
                tx,
                lobby.id,
                lobby.kickedUserIds
              )

              const createdGame = await tx.games.create({
                data: {
                  lobbyId: lobby.id,
                  gameType: toPersistedGameType(runtimeGameType),
                  state: toPersistedGameStateInput(initialState),
                  status: 'waiting',
                },
                select: { id: true, status: true },
              })

              if (carriedUserIds.length > 0) {
                await tx.players.createMany({
                  data: carriedUserIds.map((carriedUserId, index) => ({
                    gameId: createdGame.id,
                    userId: carriedUserId,
                    position: index,
                    scorecard: JSON.stringify({}),
                  })),
                  skipDuplicates: true,
                })
              }

              activeGame = createdGame
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

        // Outside the transaction on purpose: an analytics write must never be
        // able to roll back or delay someone joining a game (#816).
        await recordLobbyParticipation({
          lobbyId: lobby.id,
          lobbyCode: lobby.code,
          gameType: toPersistedGameType(runtimeGameType),
          userId: player.userId,
          isGuest: !!player.user?.isGuest,
          signupSource: getSignupSourceFromRequest(request),
        })

        break
      } catch (error) {
        if (error instanceof LobbyFullError) {
          return NextResponse.json(
            { error: 'Lobby is full', code: 'LOBBY_FULL' satisfies LobbyJoinRefusalCode },
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

    if (updates.allowSpectators === true) {
      let isPremium = false
      if (!requestUser.isGuest) {
        const dbUser = await prisma.users.findUnique({
          where: { id: requestUser.id },
          select: { premiumUntil: true },
        })
        isPremium = !!dbUser?.premiumUntil && dbUser.premiumUntil > new Date()
      }
      if (!isPremium) {
        return NextResponse.json({ error: 'Premium required to enable spectators' }, { status: 403 })
      }
    }

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
      // The roster guard above only runs when maxPlayers is sent explicitly, so a switch to
      // a smaller game clamped the seat count under the people already in the room and the
      // surplus was dropped when the game started, with nothing telling them why (#1004).
      // A waiting game hard-deletes a leaver's row, so this count is the live roster.
      if (clamped < activePlayerCount) {
        return NextResponse.json(
          {
            error: `Current player count is ${activePlayerCount}, cannot set lower max players`,
          },
          { status: 400 }
        )
      }
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

    // If game type changed, regenerate the waiting game's state to match the
    // new game type — relabeling gameType alone would leave the previous
    // game's `data` shape in place (e.g. Tic-Tac-Toe's board/currentSymbol
    // instead of Alias's teams/currentTeamIndex), crashing the new page.
    if (typeof updates.gameType === 'string' && updates.gameType !== lobby.gameType && activeGame) {
      const freshState = createGameEngine(updates.gameType, 'temp').getState()
      await prisma.games.update({
        where: { id: activeGame.id },
        data: {
          gameType: toPersistedGameType(updates.gameType),
          state: toPersistedGameStateInput(freshState),
        },
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
