import { prisma } from '@/lib/db'
import { restoreGameEngine, hasBotSupport } from '@/lib/game-registry'
import type { RegisteredGameType } from '@/lib/game-registry'
import { Move, hasScorecard } from '@/lib/game-engine'
import { executeBotTurn as executeBot, getBotDifficulty } from '@/lib/bots'
import { broadcastToLobby } from '@/lib/supabase-server'
import { apiLogger } from '@/lib/logger'
import { advanceTurnPastDisconnectedPlayers, type TurnState } from '@/lib/disconnected-turn'
import { appendGameReplaySnapshot } from '@/lib/game-replay'
import { parsePersistedGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { type BaseBotActionEvent } from '@/lib/bots/core/bot-types'
import { maybeAutoTransitionCompletedSeries } from '@/lib/lobby-series-transition'
import { sanitizeStateForBroadcast } from '@/lib/broadcast-sanitize'
import { buildTerminalFieldsAndPlayerUpdates } from '@/lib/game-persistence'
import { checkAchievementsOnStatusChange } from '@/lib/achievement-engine'
import { runAfterResponse } from '@/lib/after-response'
import { recordBotTurnApplied, type BotTurnTiming } from '@/lib/bot-turn-metrics'

export interface BotTurnRequest {
  gameId: string
  botUserId: string
  lobbyCode?: unknown
  /** A player asking for the turn must be in the game; the server handing a turn over passes none. */
  requesterId?: string
  source: string
  turnStartedAt: number
}

export interface BotTurnOutcome {
  status: number
  body: Record<string, unknown>
}

class ConcurrentBotTurnError extends Error {
  constructor() { super('Concurrent bot turn detected') }
}

// In-memory lock to prevent concurrent bot turns for the same game (best-effort within one instance)
const botTurnLocks = new Map<string, boolean>()

/** Plays one bot turn at the bot's pace, committing and broadcasting each move as it lands. */
export async function runBotTurn({
  gameId,
  botUserId,
  lobbyCode,
  requesterId,
  source,
  turnStartedAt,
}: BotTurnRequest): Promise<BotTurnOutcome> {
  const log = apiLogger('bot-turn')
  let timing: BotTurnTiming | null = null
  const commitBroadcasts: Promise<unknown>[] = []
  let lockKey: string | null = null
  let lockAcquired = false

  try {
    // Check if bot turn is already in progress for this game
    const candidateLockKey = `${gameId}:${botUserId}`
    if (botTurnLocks.get(candidateLockKey)) {
      log.warn('Bot turn already in progress, ignoring duplicate request')
      return { status: 409, body: {
        error: 'Bot turn already in progress',
        message: 'Another bot turn request is being processed'
      } }
    }

    // Acquire lock
    lockKey = candidateLockKey
    botTurnLocks.set(lockKey, true)
    lockAcquired = true

    // Load game state with retry on connection errors - optimized query
    let game
    try {
      const optimizedQuery = {
        where: { id: gameId },
        select: {
          id: true,
          state: true,
          status: true,
          currentTurn: true,
          startedAt: true,
          updatedAt: true,
          players: {
            select: {
              id: true,
              userId: true,
              score: true,
              scorecard: true,
              finalScore: true,
              placement: true,
              isWinner: true,
              user: {
                select: {
                  id: true,
                  bot: true,  // Bot relation
                },
              },
            },
          },
          lobby: {
            select: {
              id: true,
              code: true,
              gameType: true,
            },
          },
        },
      }

      game = await prisma.games.findUnique(optimizedQuery).catch(async (fetchError) => {
        // Retry once on connection error (serverless cold start issue)
        log.warn('Initial game fetch failed, retrying...', { error: fetchError.code })
        await new Promise(resolve => setTimeout(resolve, 300))
        return prisma.games.findUnique(optimizedQuery)
      })
    } catch (error) {
      log.error('Failed to load game after retry', error as Error)
      return { status: 503, body: {
        error: 'Database connection error. Please try again.',
        code: 'DB_CONNECTION_FAILED'
      } }
    }

    if (!game) {
      log.error('Game not found', undefined, { gameId: gameId })
      return { status: 404, body: { error: 'Game not found' } }
    }

    // Mutable optimistic-lock state — updated after each successful DB write so
    // sequential moves in the same bot turn (e.g. Memory: flip 1 → flip 2) don't
    // retry with stale WHERE clause values.
    let lockTurn = game.currentTurn
    let lockUpdatedAt = game.updatedAt

    if (requesterId) {
      const isParticipant = game.players.some((player) => player.userId === requesterId)
      if (!isParticipant) {
        log.warn('Forbidden bot turn request from non-participant', {
          gameId: game.id,
          requesterId,
        })
        return { status: 403, body: { error: 'Forbidden' } }
      }
    }

    const gameType = game.lobby.gameType
    const resolvedLobbyCode =
      typeof lobbyCode === 'string' && lobbyCode.trim().length > 0
        ? lobbyCode.trim()
        : game.lobby.code

    // Check if this game type supports bots
    if (!hasBotSupport(gameType)) {
      log.warn('Game type does not support bots', { gameType, gameId: game.id })
      return { status: 400, body: {
        error: 'This game type does not support bots',
        code: 'BOTS_NOT_SUPPORTED'
      } }
    }

    // Verify bot player exists and it's actually a bot
    const botPlayer = game.players.find(p => p.userId === botUserId)
    if (!botPlayer) {
      log.error('Bot player not found in game', undefined, { botUserId, gameId: game.id })
      return { status: 404, body: { error: 'Bot player not found' } }
    }

    if (!botPlayer.user.bot) {
      log.error('Player is not a bot', undefined, { botUserId, gameId: game.id })
      return { status: 400, body: { error: 'Player is not a bot' } }
    }

    log.info('Game found, processing bot turn', {
      gameId: game.id,
      gameType,
    })

    // Parse game state with error handling
    let gameState: { players: unknown[] } & Record<string, unknown>
    try {
      gameState = parsePersistedGameState(game.state) as { players: unknown[] } & Record<string, unknown>
      // Validate parsed state
      if (!gameState || typeof gameState !== 'object' || !Array.isArray(gameState.players)) {
        throw new Error('Invalid game state structure')
      }
    } catch (parseError) {
      log.error('Failed to parse game state', parseError as Error)
      return { status: 500, body: {
        error: 'Corrupted game state. Please restart the game.',
        code: 'INVALID_STATE'
      } }
    }

    const gameEngine = restoreGameEngine(gameType, game.id, gameState)

    const state = gameEngine.getState() as {
      currentPlayerIndex: number
      status: string
      data?: {
        playersReady?: string[]
      }
    }

    if (gameType === 'rock_paper_scissors') {
      if (state.status !== 'playing') {
        return { status: 400, body: {
          error: 'Game is not in playing state',
          code: 'INVALID_GAME_STATUS',
        } }
      }

      const playersReady = Array.isArray(state.data?.playersReady) ? state.data.playersReady : []
      if (playersReady.includes(botUserId)) {
        return { status: 400, body: {
          error: 'Bot already submitted choice this round',
          code: 'BOT_ALREADY_SUBMITTED',
        } }
      }

      log.info('Verified bot can submit choice for current RPS round', {
        botUserId,
        readyPlayers: playersReady.length,
      })
    } else {
      // Verify turn ownership for turn-based games
      const currentPlayerIndex = state.currentPlayerIndex
      const gamePlayers = gameEngine.getPlayers() // Use game engine's player order (sorted)
      const currentPlayer = gamePlayers[currentPlayerIndex]

      // Find corresponding database player
      const dbCurrentPlayer = game.players.find(p => p.userId === currentPlayer?.id)

      if (!dbCurrentPlayer || dbCurrentPlayer.userId !== botUserId) {
        log.warn('Not bot\'s turn', {
          currentPlayer: dbCurrentPlayer?.userId || currentPlayer?.id,
          expectedBot: botUserId
        })
        return { status: 400, body: {
          error: 'Not bot\'s turn',
          currentPlayer: dbCurrentPlayer?.userId || currentPlayer?.id,
          expectedBot: botUserId
        } }
      }

      log.info('Verified it\'s bot\'s turn, executing...')
    }

    // Get bot difficulty from bot relation
    const botDifficulty = getBotDifficulty(botPlayer)
    log.info('Bot difficulty', { difficulty: botDifficulty })

    const turnTiming: BotTurnTiming = {
      gameType,
      difficulty: botDifficulty,
      source,
      success: false,
      turnStartedAt,
      firstCommitAt: null,
      lastCommitAt: null,
      commits: 0,
    }
    timing = turnTiming

    // Every broadcast is kept alive past the response: the last commit's
    // game-update is sent just before this route returns, and an instance frozen
    // the moment the response leaves would hold the turn's hand-back until the
    // client's grace ran out (#985 was the same freeze on the trigger).
    const broadcastBotAction = async (event: BaseBotActionEvent) => {
      const sent = broadcastToLobby(resolvedLobbyCode, 'bot-action', { ...event })
      runAfterResponse(sent)
      await sent
    }

    const broadcastCommit = (state: ReturnType<typeof gameEngine.getState>) => {
      const sent = Promise.resolve(broadcastToLobby(resolvedLobbyCode, 'game-update', {
        action: 'state-change',
        // The row id, so a client can tell a rematch's update from its own (#1160).
        gameId: game.id,
        payload: sanitizeStateForBroadcast(gameType, state),
      })).then((ok) => {
        const at = Date.now()
        turnTiming.commits += 1
        turnTiming.firstCommitAt ??= at
        turnTiming.lastCommitAt = at
        if (!ok) log.warn('Failed to broadcast bot move', { gameId, botUserId })
      })
      commitBroadcasts.push(sent)
      runAfterResponse(sent)
    }

    // Dispatch to the appropriate bot executor based on game type
    await executeBot(
      gameType as RegisteredGameType,
      gameEngine,
      botUserId,
      botDifficulty,
      async (botMove: Move) => {
        log.info('Bot making move', { moveType: botMove.type, data: botMove.data })

        try {
          // Make the bot's move
          const moveSuccess = gameEngine.makeMove(botMove)
          log.info('Move result', { success: moveSuccess })

          if (!moveSuccess) {
            log.error('Move validation failed', undefined, {
              move: botMove,
              gameState: gameEngine.getState()
            })
            throw new Error('Move validation failed')
          }

          // Save to database with retry logic
          const newState = gameEngine.getState()
          const botUserIds = new Set(
            game.players
              .filter((player) => !!player.user?.bot)
              .map((player) => player.userId)
          )
          const disconnectedTurnResult = advanceTurnPastDisconnectedPlayers(newState as unknown as TurnState, botUserIds)
          const statusChanged = game.status !== newState.status
          const oldStatus = game.status
          const lastMoveAtDate = typeof newState.lastMoveAt === 'number' && Number.isFinite(newState.lastMoveAt)
            ? new Date(newState.lastMoveAt)
            : undefined
          const dbPlayersByUserId = new Map(
            game.players.map((player) => [player.userId, player])
          )
          const enginePlayers = gameEngine.getPlayers()
          const getScorecardForTerminalFields = hasScorecard(gameEngine) ? gameEngine.getScorecard.bind(gameEngine) : null
          const { terminalFields, changedPlayerUpdates } = buildTerminalFieldsAndPlayerUpdates({
            statusChanged,
            status: newState.status,
            winner: newState.winner,
            startedAt: game.startedAt,
            enginePlayers,
            dbPlayersByUserId,
            getScorecard: getScorecardForTerminalFields,
            sharedTopWins: gameType === 'yahtzee',
          })

          log.info('Saving bot move to database...', {
            moveType: botMove.type,
            currentStatus: newState.status
          })

          try {
            // Optimistic lock: only commit if the game row hasn't changed since we loaded it.
            // This prevents duplicate bot turn commits across concurrent serverless invocations.
            const newUpdatedAt = new Date()
            const botUpdateResult = await prisma.games.updateMany({
              where: { id: gameId, currentTurn: lockTurn, updatedAt: lockUpdatedAt },
              data: {
                state: toPersistedGameStateInput(newState),
                status: newState.status,
                currentTurn: lockTurn + 1,
                ...(lastMoveAtDate ? { lastMoveAt: lastMoveAtDate } : {}),
                ...terminalFields,
                updatedAt: newUpdatedAt,
              },
            })

            if (botUpdateResult.count === 0) {
              log.warn('Bot turn skipped: game state already changed (concurrent execution)', { gameId })
              throw new ConcurrentBotTurnError()
            }

            // Advance optimistic-lock state so sequential moves within the same bot turn
            // (e.g. Memory requires two flips per turn) use the correct WHERE clause values.
            const committedTurnNumber = lockTurn + 1
            lockTurn += 1
            lockUpdatedAt = newUpdatedAt

            // The board is committed, so the table can see the move now. Only a move
            // that ends the game waits for the Players rows below: the results screen
            // reads them, and the broadcast is what sends players there.
            const endsGame = newState.status !== 'playing'
            if (!endsGame) broadcastCommit(gameEngine.getState())

            // Log state transitions
            if (statusChanged) {
              log.info('Game status changed by bot', {
                gameId,
                botUserId,
                oldStatus,
                newStatus: newState.status,
                winner: newState.winner
              })
            } else {
              log.info('Database updated successfully')
            }

            if (disconnectedTurnResult.changed) {
              log.info('Skipped disconnected player turn after bot action', {
                gameId,
                botUserId,
                skippedPlayerIds: disconnectedTurnResult.skippedPlayerIds,
                currentPlayerId: disconnectedTurnResult.currentPlayerId,
              })
            }

            await checkAchievementsOnStatusChange(game.status, newState.status, game.players, log)

            const replaySnapshotPromise = appendGameReplaySnapshot({
              gameId: game.id,
              turnNumber: committedTurnNumber,
              playerId: botUserId,
              actionType: `bot:${botMove.type}`,
              actionPayload: botMove.data,
              state: newState,
            }).catch((replayError) => {
              log.warn('Failed to append replay snapshot after bot move', {
                gameId,
                botUserId,
                moveType: botMove.type,
                error: replayError,
              })
            })

            // Update player scores sequentially to avoid connection spikes on pooled DBs.
            for (const scoreUpdate of changedPlayerUpdates) {
              try {
                await prisma.players.update({
                  where: { id: scoreUpdate.id },
                  data: {
                    score: scoreUpdate.score,
                    scorecard: scoreUpdate.scorecard,
                    ...(scoreUpdate.finalScore !== undefined ? { finalScore: scoreUpdate.finalScore } : {}),
                    ...(scoreUpdate.placement !== undefined ? { placement: scoreUpdate.placement } : {}),
                    ...(scoreUpdate.isWinner !== undefined ? { isWinner: scoreUpdate.isWinner } : {}),
                  },
                }).catch(async () => {
                  log.warn('Player update failed, retrying...', { playerId: scoreUpdate.id })
                  await new Promise(resolve => setTimeout(resolve, 100))
                  return prisma.players.update({
                    where: { id: scoreUpdate.id },
                    data: {
                      score: scoreUpdate.score,
                      scorecard: scoreUpdate.scorecard,
                      ...(scoreUpdate.finalScore !== undefined ? { finalScore: scoreUpdate.finalScore } : {}),
                      ...(scoreUpdate.placement !== undefined ? { placement: scoreUpdate.placement } : {}),
                      ...(scoreUpdate.isWinner !== undefined ? { isWinner: scoreUpdate.isWinner } : {}),
                    },
                  })
                })
              } catch (playerUpdateError) {
                log.error('Failed to update player score', playerUpdateError as Error, {
                  playerId: scoreUpdate.id,
                })
              }
            }

            void replaySnapshotPromise
            log.info('Player scores updated')

          const currentState = gameEngine.getState()
          if (endsGame) broadcastCommit(currentState)

          maybeAutoTransitionCompletedSeries(
            gameEngine,
            gameType,
            currentState.status,
            {
              lobbyId: game.lobby.id,
              lobbyCode: resolvedLobbyCode,
              gameType,
              players: game.players,
            },
            (err) => {
              log.error('Failed to auto-transition completed tic-tac-toe series', err, { gameId })
            }
          )
        } catch (dbError) {
          // #1002: a lost optimistic-lock race is another instance doing the
          // turn, not a database fault. It has to reach the 409 branch of the
          // outer handler unchanged, or the client retries a turn that already
          // happened and shows the player a failure toast for a move that landed.
          if (dbError instanceof ConcurrentBotTurnError) {
            throw dbError
          }
          log.error('Critical: Failed to persist bot move state', dbError as Error, {
            gameId,
            botUserId,
            moveType: botMove.type,
          })
          throw new Error('Database connection failed. Please try again.')
        }
        } catch (error) {
          log.error('Error processing bot move', error as Error, {
            moveType: botMove.type,
            botUserId
          })
          throw error // Re-throw to stop bot turn execution
        }
      },
      broadcastBotAction // Pass the callback for bot actions
    )

    log.info('Bot turn execution completed')
    turnTiming.success = true

    // Final notification removed - already sent after each move
    const finalState = gameEngine.getState()

    return { status: 200, body: {
      success: true,
      message: 'Bot turn completed',
      currentPlayerIndex: finalState.currentPlayerIndex
    } }

  } catch (error) {
    if (error instanceof ConcurrentBotTurnError) {
      // Another instance played this turn and reports it; this one measured nothing.
      timing = null
      return { status: 409, body: { message: 'Turn already processed by another instance' } }
    }

    if (timing) timing.reason = error instanceof Error ? error.message : String(error)
    log.error('Bot turn execution failed', error as Error, {
      gameId: gameId,
      lockKey,
      errorStack: error instanceof Error ? error.stack : undefined,
      errorMessage: error instanceof Error ? error.message : String(error)
    })

    return { status: 500, body: {
      error: 'Internal server error',
      code: 'BOT_TURN_FAILED',
    } }
  } finally {
    if (lockAcquired && lockKey) {
      botTurnLocks.delete(lockKey)
    }
    const finishedTiming = timing
    if (finishedTiming) {
      runAfterResponse(
        Promise.allSettled(commitBroadcasts).then(() => recordBotTurnApplied(finishedTiming)),
      )
    }
  }
}
