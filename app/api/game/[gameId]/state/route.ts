import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { restoreGameEngine } from '@/lib/game-registry'
import { Move, Player, GameEngine, hasRollsLeft, hasScorecard, hasPendingRequest, isTimerOnlyMove, resolveTurnStartedAt, type TurnClockSnapshot } from '@/lib/game-engine'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { advanceTurnPastDisconnectedPlayers, type TurnState } from '@/lib/disconnected-turn'
import { broadcastToLobby } from '@/lib/supabase-server'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { verifyCsrfToken } from '@/lib/csrf'
import { parseAndValidateGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'
import { getGameMetadata } from '@/lib/game-catalog'
import { maybeAutoTransitionCompletedSeries } from '@/lib/lobby-series-transition'
import { buildTerminalFieldsAndPlayerUpdates } from '@/lib/game-persistence'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'
import { gameStateRequestSchema, type AutoActionContextRequest } from '@/lib/validation/game-state'
import { runAfterResponse } from '@/lib/after-response'

type AutoActionContext = AutoActionContextRequest

interface BotAutoResponse {
  type: 'undo' | 'draw'
  accepted: boolean
}

const autoActionDebounceMap = new Map<string, number>()
const AUTO_ACTION_DEBOUNCE_MS = 2000
const AUTO_ACTION_DEBOUNCE_TTL_MS = 60000
const STATE_CHANGE_NOTIFY_TIMEOUT_MS = 750
const FAST_STATE_CHANGE_NOTIFY_TIMEOUT_MS = 250
const BOT_TURN_TRIGGER_TIMEOUT_MS = 15000
const limiter = rateLimit(rateLimitPresets.game)

function normalizeTimestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }
  return null
}

function resolveTurnTimerMs(turnTimer: unknown): number {
  if (typeof turnTimer !== 'number' || !Number.isFinite(turnTimer)) return 0
  if (turnTimer <= 0) return 0
  return Math.max(0, Math.floor(turnTimer * 1000))
}

function resolveLastMoveAtMs(stateLastMoveAt: unknown, fallback?: Date | null): number | null {
  const stateTimestamp = normalizeTimestamp(stateLastMoveAt)
  if (stateTimestamp !== null) return stateTimestamp
  if (fallback instanceof Date) {
    const fallbackTimestamp = fallback.getTime()
    return Number.isNaN(fallbackTimestamp) ? null : fallbackTimestamp
  }
  return null
}

function resolveLastMoveAtDate(stateLastMoveAt: unknown): Date | undefined {
  const timestamp = normalizeTimestamp(stateLastMoveAt)
  if (timestamp === null) return undefined
  return new Date(timestamp)
}

function shouldDebounceAutoAction(key: string): boolean {
  const now = Date.now()
  const previous = autoActionDebounceMap.get(key)

  if (previous && now - previous < AUTO_ACTION_DEBOUNCE_MS) {
    return true
  }

  autoActionDebounceMap.set(key, now)

  // Opportunistic cleanup to avoid unbounded growth.
  for (const [storedKey, timestamp] of autoActionDebounceMap.entries()) {
    if (now - timestamp > AUTO_ACTION_DEBOUNCE_TTL_MS) {
      autoActionDebounceMap.delete(storedKey)
    }
  }

  return false
}

function resolveTurnEndToBotTriggerMs(state: unknown, triggeredAt: number): number | null {
  const stateRecord = typeof state === 'object' && state !== null
    ? (state as Record<string, unknown>)
    : null
  const lastMoveAt = normalizeTimestamp(stateRecord?.lastMoveAt)
  if (lastMoveAt === null) return null

  const latencyMs = triggeredAt - lastMoveAt
  return Number.isFinite(latencyMs) && latencyMs >= 0 ? latencyMs : null
}

function resolveStateChangeNotifyTimeoutMs(gameType: string): number {
  return gameType === 'tic_tac_toe'
    ? FAST_STATE_CHANGE_NOTIFY_TIMEOUT_MS
    : STATE_CHANGE_NOTIFY_TIMEOUT_MS
}

function autoTriggerBotTurn(params: {
  request: NextRequest
  log: ReturnType<typeof apiLogger>
  gameId: string
  gameType: string
  lobbyCode: string
  botUserId: string
  moveType: string
  authoritativeState: unknown
}) {
  const { request, log, gameId, gameType, lobbyCode, botUserId, moveType, authoritativeState } = params
  const botTurnApiUrl = `${request.nextUrl.origin}/api/game/${gameId}/bot-turn`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BOT_TURN_TRIGGER_TIMEOUT_MS)
  const triggeredAt = Date.now()
  const turnEndToBotTriggerMs = resolveTurnEndToBotTriggerMs(authoritativeState, triggeredAt)
  const internalSecret = process.env.BOARDLY_INTERNAL_SECRET
  const forwardedAuthorization = request.headers.get('authorization')
  const forwardedGuestToken = request.headers.get('X-Guest-Token')
  // A registered user's session lives in a cookie. The bot-turn route runs on
  // the same origin and authorises the caller the same way this route did, so
  // the cookie travels with the internal call – without it a logged-in player
  // in an environment with no BOARDLY_INTERNAL_SECRET (local dev) got a silent
  // 401 and a bot that never moved.
  const forwardedCookie = request.headers.get('cookie')
  const botTurnHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (internalSecret) {
    botTurnHeaders['X-Internal-Secret'] = internalSecret
  }

  if (forwardedAuthorization) {
    botTurnHeaders.authorization = forwardedAuthorization
  }

  if (forwardedGuestToken) {
    botTurnHeaders['X-Guest-Token'] = forwardedGuestToken
  }

  if (forwardedCookie) {
    botTurnHeaders.cookie = forwardedCookie
  }

  if (!internalSecret && !forwardedAuthorization && !forwardedGuestToken && !forwardedCookie) {
    log.warn('Bot turn trigger has no identity: set BOARDLY_INTERNAL_SECRET or call with a session', {
      gameId,
      botUserId,
    })
  }

  log.debug('Auto-triggering bot turn after player move', {
    gameId,
    gameType,
    botUserId,
    moveType,
    turnEndToBotTriggerMs,
  })

  // `after()` and not a bare `void fetch(...)`: this route returns as soon as the
  // move is written, and on Vercel the instance can be frozen the moment the
  // response is sent — which cut the trigger off mid-flight and left the bot
  // waiting for a client-side watchdog (in Rock Paper Scissors, the full round
  // timer). `after` keeps the invocation alive until the work settles.
  runAfterResponse(
    fetch(botTurnApiUrl, {
    method: 'POST',
    headers: botTurnHeaders,
    body: JSON.stringify({
      botUserId,
      lobbyCode,
      triggerSource: 'state-route-auto',
      triggeredAt,
      turnEndToBotTriggerMs,
    }),
    signal: controller.signal,
  })
    .then(async (botResponse) => {
      clearTimeout(timeoutId)
      if (!botResponse.ok) {
        const errorPayload = await botResponse.json().catch(() => null)
        log.warn('Auto-triggered bot turn failed', {
          gameId,
          botUserId,
          status: botResponse.status,
          error: errorPayload,
        })
      }
    })
    .catch((triggerError) => {
      clearTimeout(timeoutId)
      if ((triggerError as Error)?.name === 'AbortError') {
        log.warn('Auto-triggered bot turn request timed out', {
          gameId,
          botUserId,
        })
        return
      }

      log.warn('Failed to auto-trigger bot turn request', {
        gameId,
        botUserId,
        error: triggerError,
      })
    })
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const log = apiLogger('POST /api/game/[gameId]/state')

  try {
    const rateLimitResult = await limiter(request)
    if (rateLimitResult) {
      return rateLimitResult
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { gameId } = await params

    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    log.debug('Game state update attempt', {
      gameId,
      userId,
      isGuest: requestUser?.isGuest,
      username: requestUser?.username,
      hasToken: !!request.headers.get('X-Guest-Token'),
      hasAuth: !!request.headers.get('authorization')
    })

    if (!userId) {
      log.warn('Unauthorized game state update attempt', { gameId })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requestBody = await request.json()
    const parsedBody = gameStateRequestSchema.safeParse(requestBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid move data', issues: parsedBody.error.issues },
        { status: 400 }
      )
    }

    const move = parsedBody.data.move
    const autoActionContext = parsedBody.data.autoActionContext
    const isAutoAction = autoActionContext?.source === 'turn-timeout'

    if (isAutoAction) {
      const debounceKey = `${gameId}:${autoActionContext.debounceKey}:${move.type}`
      if (shouldDebounceAutoAction(debounceKey)) {
        return NextResponse.json(
          {
            skipped: true,
            code: 'AUTO_ACTION_DEBOUNCED',
            message: 'Duplicate auto action ignored',
          },
          { status: 202 }
        )
      }
    }

    // Get game from database - optimize by selecting only needed fields
    log.debug('Fetching game from database', { gameId, userId })
    
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        state: true,
        status: true,
        currentTurn: true,
        updatedAt: true,
        lastMoveAt: true,
        startedAt: true,
        players: {
          select: {
            id: true,
            userId: true,
            score: true,
            finalScore: true,
            placement: true,
            isWinner: true,
            scorecard: true,
            // Read so the series auto-transition below can tell a seat that is still
            // occupied from one whose player soft-left the finished game (#1011).
            leftAt: true,
            user: {
              select: {
                id: true,
                username: true,
                bot: true,
              },
            },
          },
        },
        lobby: {
          select: {
            id: true,
            code: true,
            gameType: true,
            turnTimer: true,
          },
        },
      },
    }).catch((dbError) => {
      log.error('Database query failed', dbError as Error, { gameId, userId })
      throw dbError
    })

    if (!game) {
      log.warn('Game not found', { gameId, userId })
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Sketch & Guess has its own move route, which applies the game's phase
    // clock, checks who the host is, and redacts the answer per viewer. This
    // generic one did none of that and passed the client's move data straight
    // to the engine, so a forged host acceptance got through (PR #1100 review).
    if (game.lobby.gameType === 'sketch_and_guess') {
      return NextResponse.json(
        { error: 'Sketch & Guess moves go through /sketch-and-guess-action', code: 'USE_SKETCH_ACTION_ROUTE' },
        { status: 400 }
      )
    }
    
    log.debug('Game fetched successfully', { gameId, status: game.status })

    interface GamePlayer {
      id: string
      userId: string
      score: number
      finalScore: number | null
      placement: number | null
      isWinner: boolean
      scorecard: string | null
      leftAt: Date | null
      user: {
        id: string
        username: string | null
        bot: unknown
      }
    }

    // Verify user is a player in this game
    const playerRecord = (game.players as GamePlayer[]).find((p) => p.userId === userId)
    if (!playerRecord) {
      return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 })
    }

    // Recreate game engine from saved state
    let gameState: unknown
    try {
      gameState = parseAndValidateGameState(game.state)
    } catch (parseError) {
      log.error('Failed to parse game state', parseError as Error)
      return NextResponse.json({
        error: 'Corrupted game state. Please restart the game.'
      }, { status: 500 })
    }

    let gameEngine: GameEngine

    // Use registry to restore the correct engine for this game type
    try {
      gameEngine = restoreGameEngine(game.lobby.gameType, game.id, gameState)
    } catch {
      return NextResponse.json({ error: 'Unsupported game type' }, { status: 400 })
    }

    // A move only the turn timer may send (#1102) must come through the timer
    // path below, and only where there is a timer whose deadline it can have
    // passed. Otherwise a client could post it at any moment of its turn and the
    // TURN_TIMER_ACTIVE guard - which only runs for auto-actions - never sees it.
    if (
      isTimerOnlyMove(gameEngine, { playerId: userId, type: move.type, data: move.data || {}, timestamp: new Date() }) &&
      (!isAutoAction || resolveTurnTimerMs(game.lobby?.turnTimer) <= 0)
    ) {
      return NextResponse.json(
        { error: 'This move is only made by the turn timer', code: 'TIMER_ONLY_MOVE' },
        { status: 400 }
      )
    }

    if (isAutoAction) {
      const snapshot = autoActionContext.turnSnapshot
      const serverState = gameEngine.getState()
      const serverCurrentPlayer = gameEngine.getCurrentPlayer()
      const serverStateUpdatedAt = normalizeTimestamp(serverState?.updatedAt)
      const snapshotUpdatedAt = normalizeTimestamp(snapshot.updatedAt)
      const serverLastMoveAt =
        typeof serverState?.lastMoveAt === 'number' && Number.isFinite(serverState.lastMoveAt)
          ? serverState.lastMoveAt
          : null
      const snapshotLastMoveAt =
        typeof snapshot.lastMoveAt === 'number' && Number.isFinite(snapshot.lastMoveAt)
          ? snapshot.lastMoveAt
          : null

      const isSameTurn =
        snapshot.currentPlayerIndex === serverState.currentPlayerIndex &&
        snapshot.currentPlayerId === serverCurrentPlayer?.id &&
        snapshotLastMoveAt === serverLastMoveAt

      const serverRollsLeft = hasRollsLeft(gameEngine) ? gameEngine.getRollsLeft() : null

      const isSameMoveWindow =
        snapshotUpdatedAt !== null &&
        serverStateUpdatedAt !== null &&
        snapshotUpdatedAt === serverStateUpdatedAt &&
        (serverRollsLeft === null || snapshot.rollsLeft === serverRollsLeft)

      if (!isSameTurn || !isSameMoveWindow) {
        log.debug('Auto action skipped: turn already ended or state changed', {
          gameId,
          userId,
          moveType: move.type,
          snapshot,
          server: {
            currentPlayerId: serverCurrentPlayer?.id,
            currentPlayerIndex: serverState.currentPlayerIndex,
            lastMoveAt: serverLastMoveAt,
            rollsLeft: serverRollsLeft,
            updatedAt: serverStateUpdatedAt,
          },
        })

        return NextResponse.json(
          {
            error: 'Turn already ended',
            code: 'TURN_ALREADY_ENDED',
            skipped: true,
          },
          { status: 409 }
        )
      }

      const turnTimerMs = resolveTurnTimerMs(game.lobby?.turnTimer)
      if (turnTimerMs > 0) {
        // The clock runs from the start of the turn, not from the last thing
        // anybody did: a draw or undo prompt bumps lastMoveAt without handing
        // the turn over, and measuring from that made the timeout look early
        // and rejected a forfeit the player had genuinely earned (#998).
        const lastMoveAtMs = resolveLastMoveAtMs(
          serverState?.turnStartedAt ?? serverState?.lastMoveAt,
          game.lastMoveAt
        )
        if (lastMoveAtMs !== null) {
          const elapsedMs = Date.now() - lastMoveAtMs
          if (elapsedMs < turnTimerMs) {
            return NextResponse.json(
              {
                error: 'Turn timer still active',
                code: 'TURN_TIMER_ACTIVE',
                skipped: true,
                remainingMs: Math.max(0, turnTimerMs - elapsedMs),
              },
              { status: 409 }
            )
          }
        } else {
          log.warn('Auto action missing lastMoveAt, skipping timer guard', {
            gameId,
            userId,
            moveType: move.type,
          })
        }
      }
    }

    // Create move object
    const gameMove: Move = {
      playerId: userId,
      type: move.type,
      data: move.data || {},
      timestamp: new Date(),
    }

    // Where the seat's clock stood before this move, so a timeout auto-action
    // can be stopped from resetting it (#1007). Only an auto-action needs it.
    const turnBeforeMove: TurnClockSnapshot | null = isAutoAction
      ? {
          currentPlayerIndex: gameEngine.getState().currentPlayerIndex,
          turnStartedAtMs: resolveTurnStartedAt(gameEngine.getState()),
        }
      : null

    // Make the move
    const moveResult = gameEngine.makeMove(gameMove)
    if (!moveResult) {
      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    if (turnBeforeMove) {
      // Yahtzee's timeout rolls first and scores second; letting the roll stamp
      // a new turnStartedAt made the score too early by the guard above (#1007).
      gameEngine.holdTurnClock(turnBeforeMove)
    }

    let botAutoResponse: BotAutoResponse | null = null
    if (hasPendingRequest(gameEngine)) {
      const pendingRequest = gameEngine.getPendingRequest()

      if (pendingRequest) {
        const responderPlayer = (game.players as GamePlayer[]).find(
          (player) => player.userId === pendingRequest.responderId
        )

        if (responderPlayer?.user?.bot) {
          const accepted =
            pendingRequest.type === 'undo' ? true : gameEngine.isTheoreticalDraw()
          const responseMove: Move = {
            playerId: pendingRequest.responderId,
            type: pendingRequest.type === 'undo' ? 'respond-undo' : 'respond-draw',
            data: { accept: accepted },
            timestamp: new Date(),
          }

          const responseApplied = gameEngine.makeMove(responseMove)
          if (responseApplied) {
            botAutoResponse = {
              type: pendingRequest.type,
              accepted,
            }
          } else {
            log.warn('Bot auto-response for Tic-Tac-Toe request failed validation', {
              gameId,
              responderId: pendingRequest.responderId,
              requestType: pendingRequest.type,
            })
          }
        }
      }
    }

    // Check if game status changed after this move
    const newState = gameEngine.getState()
    const botUserIds = new Set(
      (game.players as GamePlayer[])
        .filter((player) => !!player.user?.bot)
        .map((player) => player.userId)
    )
    const disconnectedTurnResult = advanceTurnPastDisconnectedPlayers(newState as unknown as TurnState, botUserIds)
    const statusChanged = game.status !== newState.status
    const oldStatus = game.status

    if (disconnectedTurnResult.changed) {
      log.debug('Skipped disconnected player turn after move', {
        gameId,
        userId,
        skippedPlayerIds: disconnectedTurnResult.skippedPlayerIds,
        currentPlayerId: disconnectedTurnResult.currentPlayerId,
      })
    }

    const lastMoveAtDate = resolveLastMoveAtDate(newState.lastMoveAt)

    // Scorecard is optional and available only for games that implement getScorecard().
    const getScorecard = hasScorecard(gameEngine) ? gameEngine.getScorecard.bind(gameEngine) : null
    const enginePlayers = gameEngine.getPlayers()
    const gamePlayers = game.players as GamePlayer[]
    const dbPlayersByUserId = new Map(gamePlayers.map((player) => [player.userId, player]))
    const { terminalFields, changedPlayerUpdates } = buildTerminalFieldsAndPlayerUpdates({
      statusChanged,
      status: newState.status,
      winner: newState.winner,
      startedAt: game.startedAt,
      enginePlayers: enginePlayers as Player[],
      dbPlayersByUserId,
      getScorecard,
    })

    const gameUpdateResult = await prisma.$transaction(async (tx) => {
      // Optimistic concurrency control:
      // apply update only if game row is still at the same revision we loaded.
      const gameUpdate = await tx.games.updateMany({
        where: {
          id: gameId,
          currentTurn: game.currentTurn,
          updatedAt: game.updatedAt,
        },
        data: {
          state: toPersistedGameStateInput(newState),
          status: newState.status,
          currentTurn: game.currentTurn + 1,
          ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
          ...terminalFields,
          updatedAt: new Date(),
        },
      })

      if (gameUpdate.count === 0) {
        return gameUpdate
      }

      await Promise.all(changedPlayerUpdates.map((scoreUpdate) =>
        tx.players.update({
          where: { id: scoreUpdate.id },
          data: {
            score: scoreUpdate.score,
            scorecard: scoreUpdate.scorecard,
            ...(scoreUpdate.finalScore !== undefined ? { finalScore: scoreUpdate.finalScore } : {}),
            ...(scoreUpdate.placement !== undefined ? { placement: scoreUpdate.placement } : {}),
            ...(scoreUpdate.isWinner !== undefined ? { isWinner: scoreUpdate.isWinner } : {}),
          },
        })
      ))

      return gameUpdate
    })

    if (gameUpdateResult.count === 0) {
      const code = isAutoAction ? 'TURN_ALREADY_ENDED' : 'STATE_CONFLICT'
      const message = isAutoAction ? 'Turn already ended' : 'Game state changed, please retry'
      return NextResponse.json(
        { error: message, code, skipped: isAutoAction },
        { status: 409 }
      )
    }

    // Log state transitions for debugging
    if (statusChanged) {
      log.info('Game status changed', {
        gameId,
        userId,
        moveType: gameMove.type,
        oldStatus,
        newStatus: newState.status,
        winner: newState.winner
      })
    }

    await checkAchievementsOnStatusChange(game.status, newState.status, gamePlayers, log)

    const authoritativeState = gameEngine.getState()
    const replaySnapshotPromise = appendGameReplaySnapshot({
      gameId,
      turnNumber: game.currentTurn + 1,
      playerId: userId,
      actionType: move.type,
      actionPayload: move.data,
      state: newState,
    }).catch((replayError) => {
      log.warn('Failed to append replay snapshot', {
        gameId,
        userId,
        moveType: move.type,
        error: replayError,
      })
    })

    const requestPlayerIsBot = !!playerRecord.user?.bot
    const botPlayers = gamePlayers.filter((player) => !!player.user?.bot)
    let botUserIdToTrigger: string | null = null

    if (!requestPlayerIsBot && authoritativeState.status === 'playing' && botPlayers.length > 0) {
      if (game.lobby.gameType === 'rock_paper_scissors' && gameMove.type === 'submit-choice') {
        const rpsData = (authoritativeState as { data?: { playersReady?: string[] } }).data
        const playersReady = Array.isArray(rpsData?.playersReady) ? rpsData.playersReady : []
        const pendingBot = botPlayers.find((player) => !playersReady.includes(player.userId))
        if (pendingBot) {
          botUserIdToTrigger = pendingBot.userId
        }
      } else if (getGameMetadata(game.lobby.gameType)?.usesTurnIndex) {
        const currentPlayerId = enginePlayers[authoritativeState.currentPlayerIndex]?.id
        const currentBotPlayer = botPlayers.find((player) => player.userId === currentPlayerId)
        if (currentBotPlayer) {
          botUserIdToTrigger = currentBotPlayer.userId
        }
      }
    }

    if (botUserIdToTrigger) {
      autoTriggerBotTurn({
        request,
        log,
        gameId,
        gameType: game.lobby.gameType,
        lobbyCode: game.lobby.code,
        botUserId: botUserIdToTrigger,
        moveType: gameMove.type,
        authoritativeState,
      })
    }

    const broadcastState = sanitizeStateForBroadcast(game.lobby.gameType, authoritativeState)

    // Viewer-aware sanitizers (currently just RPS) keep the requesting
    // player's own not-yet-revealed data visible in the direct response,
    // while the shared broadcast above hides it from everyone else.
    const responseState = sanitizeStateForBroadcast(game.lobby.gameType, authoritativeState, userId)

    void replaySnapshotPromise
    void broadcastToLobby(game.lobby.code, 'game-update', {
      action: 'state-change',
      // The row id, so a client can tell a rematch's update from its own (#1160).
      gameId: game.id,
      payload: broadcastState,
    }).then((ok) => {
      if (!ok) {
        log.warn('Failed to broadcast authoritative state snapshot', {
          gameId,
          lobbyCode: game.lobby.code,
          userId,
        })
      }
    })

    maybeAutoTransitionCompletedSeries(
      gameEngine,
      game.lobby.gameType,
      authoritativeState.status,
      {
        lobbyId: game.lobby.id,
        lobbyCode: game.lobby.code,
        gameType: game.lobby.gameType,
        players: gamePlayers,
      },
      (err) => {
        log.error('Failed to auto-transition completed tic-tac-toe series', err, { gameId })
      }
    )

    const response = {
      game: {
        id: game.id,
        status: authoritativeState.status,
        state: responseState,
        players: enginePlayers.map((player: Player) => {
          const dbPlayer = dbPlayersByUserId.get(player.id)
          return {
            id: player.id,
            name: dbPlayer?.user.username || player.name || 'Unknown',
            score: typeof player.score === 'number' ? player.score : 0,
            isBot: !!dbPlayer?.user.bot,
          }
        }),
      },
      ...(botAutoResponse ? { autoResponse: botAutoResponse } : {}),
    }

    return NextResponse.json(response)
  } catch (error) {
    log.error('Update game state error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
