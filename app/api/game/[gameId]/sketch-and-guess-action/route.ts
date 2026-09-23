import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  SketchAndGuessGame,
  sanitizeSketchAndGuessActionEventForBroadcast,
  sanitizeSketchAndGuessStateForBroadcast,
} from '@/lib/games/sketch-and-guess-game'
import { Move, type RestorableGameState } from '@/lib/game-engine'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { getRequestAuthUser } from '@/lib/request-auth'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { sketchAndGuessActionRequestSchema } from '@/lib/validation/sketch-and-guess'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { buildPartyGameTerminalUpdate } from '@/lib/game-persistence'
import { commitGameState, GameStateConflictError, type GameRowRevision } from '@/lib/game-state-lock'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'

const limiter = rateLimit(rateLimitPresets.game)

function resolveLastMoveAtDate(lastMoveAt: unknown): Date | undefined {
  if (typeof lastMoveAt === 'number' && Number.isFinite(lastMoveAt)) {
    return new Date(lastMoveAt)
  }
  return undefined
}

function resolveTurnTimerSeconds(turnTimer: unknown): number {
  if (typeof turnTimer !== 'number' || !Number.isFinite(turnTimer)) {
    return 0
  }
  return Math.max(0, Math.floor(turnTimer))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const log = apiLogger('POST /api/game/[gameId]/sketch-and-guess-action')

  try {
    const { gameId } = await params
    const requestUser = await getRequestAuthUser(request)
    const userId = requestUser?.id

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rawBody = await request.json()
    // The mover's UI language, for the word hint in the state handed back (#1082).
    const viewerLocale =
      rawBody && typeof rawBody === 'object' && typeof (rawBody as { locale?: unknown }).locale === 'string'
        ? ((rawBody as { locale: string }).locale.slice(0, 16))
        : null
    const parsedBody = sketchAndGuessActionRequestSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: 'Invalid action payload',
          issues: parsedBody.error.issues,
        },
        { status: 400 }
      )
    }

    const game = await prisma.games.findUnique({
      where: { id: gameId },
      include: {
        players: {
          include: {
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
            code: true,
            gameType: true,
            turnTimer: true,
            creatorId: true,
          },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const resolvedGameType = game.lobby?.gameType || game.gameType
    if (resolvedGameType !== 'sketch_and_guess') {
      return NextResponse.json({ error: 'Invalid game type' }, { status: 400 })
    }

    const player = game.players.find((entry) => entry.userId === userId)
    if (!player) {
      return NextResponse.json({ error: 'Player not in this game' }, { status: 403 })
    }

    let parsedState: RestorableGameState
    try {
      parsedState = parsePersistedGameState<RestorableGameState>(game.state)
    } catch {
      return NextResponse.json({ error: 'Corrupted game state' }, { status: 500 })
    }

    const sketchGame = new SketchAndGuessGame(gameId)
    sketchGame.restoreState(parsedState)

    const gamePlayersByUserId = new Map(
      game.players.map((entry) => [entry.userId, entry])
    )

    // #993: a party round has every player submitting into the same phase at
    // the same moment, so each write is conditioned on the revision it read and
    // the loser is told nothing landed instead of replaying its own snapshot
    // over the others. One request can persist twice (timeout fallback, then the
    // move), so the lock moves on with the row.
    let revision: GameRowRevision = { currentTurn: game.currentTurn, updatedAt: game.updatedAt }

    const persistSketchState = async (
      nextState: ReturnType<SketchAndGuessGame['getState']>,
      actionType: string,
      actionPayload: Record<string, unknown> | undefined,
      actingPlayerId?: string | null,
      emitActionEvent?: {
        action: string
        playerId?: string | null
        data?: Record<string, unknown>
      }
    ) => {
      const lastMoveAtDate = resolveLastMoveAtDate(nextState.lastMoveAt)

      // #729: a transition into a terminal status must also write the
      // per-player isWinner/finalScore/placement fields stats derive from.
      const terminalUpdate = buildPartyGameTerminalUpdate({
        previousStatus: game.status,
        state: nextState,
        startedAt: game.startedAt,
        dbPlayers: game.players,
      })

      const committed = await commitGameState({
        gameId,
        revision,
        data: {
          state: toPersistedGameStateInput(nextState),
          status: nextState.status,
          ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
          ...(terminalUpdate ? terminalUpdate.terminalFields : {}),
        },
      })

      if (!committed) {
        throw new GameStateConflictError()
      }
      revision = committed

      if (terminalUpdate) {
        // The terminal diff supersedes the per-move score sync below — one
        // update per player carrying score + finalScore/placement/isWinner.
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
      } else {
        const scoreUpdates: Array<Promise<unknown>> = []
        const statePlayers = Array.isArray(nextState.players) ? nextState.players : []
        for (const statePlayer of statePlayers) {
          if (!statePlayer || typeof statePlayer !== 'object') continue

          const playerId = (statePlayer as { id?: unknown }).id
          if (typeof playerId !== 'string') continue

          const dbPlayer = gamePlayersByUserId.get(playerId)
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
      }

      await appendGameReplaySnapshot({
        gameId,
        playerId: actingPlayerId ?? null,
        actionType,
        actionPayload,
        state: nextState,
      })

      if (game.lobby?.code) {
        // No single viewer for a shared broadcast — strip the live prompt for
        // everyone; each client re-fetches its own viewer-sanitized state via
        // GET /api/lobby/[code] rather than trusting this payload directly.
        const broadcastState = sanitizeSketchAndGuessStateForBroadcast(nextState, null)

        if (emitActionEvent) {
          // The move payload needs the same redaction as the state: for a
          // submit-guess it is `{ guess: '<the word>' }`, and this topic is the
          // one every seated player is joined to (#1032).
          void broadcastToLobby(game.lobby.code, 'sketch-and-guess-action', {
            action: emitActionEvent.action,
            playerId: emitActionEvent.playerId ?? null,
            data: sanitizeSketchAndGuessActionEventForBroadcast(emitActionEvent.data),
            state: broadcastState,
          })
        }

        void broadcastToLobby(game.lobby.code, 'game-update', {
          action: 'state-change',
          payload: { state: broadcastState },
        })
      }

      await checkAchievementsOnStatusChange(game.status, nextState.status, game.players, log)
    }

    const turnTimerSeconds = resolveTurnTimerSeconds(game.lobby?.turnTimer)
    const timeoutResolution = sketchGame.applyTimeoutFallback(turnTimerSeconds)
    const timeoutFallbackApplied = timeoutResolution.changed

    if (timeoutFallbackApplied) {
      log.info('Applied Sketch & Guess timeout fallback before action', {
        gameId,
        userId,
        turnTimerSeconds,
        timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
        autoPickedWords: timeoutResolution.autoPickedWords,
        phaseTransitions: timeoutResolution.phaseTransitions,
        revealAdvances: timeoutResolution.revealAdvances,
        autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
        autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
        autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
      })
    }

    const body = parsedBody.data
    const now = new Date()
    let move: Move
    if (body.action === 'advance-round') {
      move = { playerId: userId, type: 'advance-round', data: {}, timestamp: now }
    } else if (body.action === 'submit-drawing') {
      move = { playerId: userId, type: 'submit-drawing', data: { content: body.data.content.trim() }, timestamp: now }
    } else if (body.action === 'choose-word') {
      move = { playerId: userId, type: 'choose-word', data: { wordId: body.data.wordId }, timestamp: now }
    } else if (body.action === 'accept-guess') {
      // #1082: only the lobby's creator may overrule the matcher. The host is a
      // lobby fact, not a game one, so it is checked here and the engine is told.
      if (!game.lobby?.creatorId || game.lobby.creatorId !== userId) {
        return NextResponse.json({ error: 'Only the host can accept a guess', code: 'NOT_HOST' }, { status: 403 })
      }
      // Accepting a guess that is already accepted changes nothing, so it
      // writes nothing – a double tap or a retry after a lost response is a
      // success, not an error and not a second row in the replay.
      if (!timeoutFallbackApplied && sketchGame.isGuessAcceptedByHost(body.data.guessId)) {
        return NextResponse.json({
          success: true,
          state: sanitizeSketchAndGuessStateForBroadcast(sketchGame.getState(), userId, { viewerLocale, hostUserId: game.lobby?.creatorId ?? null }),
          timeoutFallbackApplied: false,
        })
      }
      move = {
        playerId: userId,
        type: 'accept-guess',
        data: { guessId: body.data.guessId, authorizedAsHost: true },
        timestamp: now,
      }
    } else {
      move = { playerId: userId, type: 'submit-guess', data: { guess: body.data.guess.trim() }, timestamp: now }
    }

    const moveAccepted = sketchGame.makeMove(move)
    if (!moveAccepted) {
      if (timeoutFallbackApplied) {
        const stateAfterTimeout = sketchGame.getState()
        await persistSketchState(
          stateAfterTimeout,
          'sketch_and_guess:timeout-fallback',
          {
            timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
            autoPickedWords: timeoutResolution.autoPickedWords,
            autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
            autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          },
          null,
          {
            action: 'timeout-fallback',
            playerId: null,
            data: {
              timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
              autoPickedWords: timeoutResolution.autoPickedWords,
              autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
              autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
              autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
            },
          }
        )

        return NextResponse.json(
          {
            error: 'Move expired due to timeout fallback',
            code: 'ROUND_TIMEOUT_ADVANCED',
            state: sanitizeSketchAndGuessStateForBroadcast(stateAfterTimeout, userId, { viewerLocale, hostUserId: game.lobby?.creatorId ?? null }),
          },
          { status: 409 }
        )
      }

      if (move.type === 'submit-guess') {
        const rejection = sketchGame.getGuessRejection(move)
        if (rejection) {
          return NextResponse.json(
            {
              error: rejection === 'too-fast' ? 'Guessing too fast' : 'No guesses left this round',
              code: rejection === 'too-fast' ? 'GUESS_TOO_FAST' : 'GUESS_LIMIT_REACHED',
            },
            { status: 429 }
          )
        }
      }

      return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    }

    // Close, correct or neither – told to the one who typed it and nobody else.
    // The shared broadcast below never carries it.
    const guessOutcome = move.type === 'submit-guess' ? sketchGame.getLastGuessOutcome() : null

    const updatedState = sketchGame.getState()
    await persistSketchState(
      updatedState,
      `sketch_and_guess:${body.action}`,
      move.data,
      userId,
      {
        action: body.action,
        playerId: userId,
        data: move.data,
      }
    )

    return NextResponse.json({
      success: true,
      state: sanitizeSketchAndGuessStateForBroadcast(updatedState, userId, { viewerLocale, hostUserId: game.lobby?.creatorId ?? null }),
      timeoutFallbackApplied,
      ...(guessOutcome ? { guessResult: { correct: guessOutcome.correct, close: guessOutcome.close } } : {}),
      timeoutFallback: timeoutFallbackApplied
        ? {
            timeoutWindowsConsumed: timeoutResolution.timeoutWindowsConsumed,
            autoPickedWords: timeoutResolution.autoPickedWords,
            autoSubmittedDrawings: timeoutResolution.autoSubmittedDrawings,
            autoSubmittedGuesses: timeoutResolution.autoSubmittedGuesses,
            autoSubmittedPlayerIds: timeoutResolution.autoSubmittedPlayerIds,
          }
        : undefined,
    })
  } catch (error) {
    if (error instanceof GameStateConflictError) {
      return NextResponse.json(
        { error: 'Game state changed, please retry', code: 'STATE_CONFLICT' },
        { status: 409 }
      )
    }

    log.error('Error processing Sketch & Guess action', error as Error)
    return NextResponse.json(
      { error: 'Failed to process action' },
      { status: 500 }
    )
  }
}
