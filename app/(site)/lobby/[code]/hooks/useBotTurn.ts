import { useEffect, useRef, useCallback } from 'react'
import { GameEngine } from '@/lib/game-engine'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import {
  BOT_COMMIT_DELIVERY_ALLOWANCE_MS,
  isBotPacedGameType,
  resolveBotTurnGraceMs,
} from '@/lib/bots/core/bot-turn-pace'

const MAX_BOT_RETRIES = 2
const WATCHDOG_MS = 14_000
const RETRY_DELAY_MS = 2_000
/** How often an armed trigger re-checks while another bot's request is still open. */
const BOT_BUSY_RECHECK_MS = 250

interface GamePlayer {
  userId: string
  user?: {
    bot?: unknown  // Bot relation (one-to-one with Bots table)
  }
}

interface Game {
  id: string
  players?: GamePlayer[]
}

interface UseBotTurnProps {
  game: Game | null
  gameEngine: GameEngine | null
  code: string
  isGameStarted: boolean
  isSpectator?: boolean
  /**
   * The lobby's game type. It sets how long the monitor waits for the server's
   * own driver, because that is a property of the game's bot executor. Left out,
   * the wait falls back to the slowest game in the catalog, which is the safe
   * direction: too long only delays a fallback, too short sends a doomed request.
   */
  gameType?: string | null
  reconcileWithServerSnapshot?: () => Promise<void> | void
}

export function useBotTurn({
  game,
  gameEngine,
  code,
  isGameStarted,
  isSpectator = false,
  gameType,
  reconcileWithServerSnapshot,
}: UseBotTurnProps) {
  const botTurnInProgress = useRef(false)
  const lastBotPlayerId = useRef<string | null>(null)
  const lastPlayerIndex = useRef<number | null>(null)
  const retryAttemptRef = useRef(0)
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The bot turn this hook has already armed a deferred request for, as
  // "<gameId>:<botUserId>:<currentPlayerIndex>:<lastMoveAt>". lastMoveAt is in
  // there on purpose: a Memory bot commits a flip at a time inside one turn, and
  // every commit must re-arm the timer rather than let it fire into a turn that
  // is visibly running.
  const armedSignatureRef = useRef<string | null>(null)
  // The bot turn on screen right now, or null when it is not a bot's turn.
  // An armed trigger that had to wait reads it to see whether its turn survived.
  const currentTurnSignatureRef = useRef<string | null>(null)
  const armedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The armed turn this hook has already asked the server about. The grace
  // expiring only means nothing has reached this tab; it does not mean the bot
  // is stuck. Reconciling once before writing is what turns a late broadcast
  // into no request at all instead of a "Not bot's turn" 400.
  const reconciledSignatureRef = useRef<string | null>(null)
  // Ref to always hold the latest triggerBotTurn for self-referencing retries
  const triggerBotTurnRef = useRef<((botUserId: string, gameId: string) => Promise<void>) | null>(null)

  const cancelArmedTrigger = useCallback(() => {
    if (armedTimerRef.current !== null) {
      clearTimeout(armedTimerRef.current)
      armedTimerRef.current = null
    }
    armedSignatureRef.current = null
    reconciledSignatureRef.current = null
    currentTurnSignatureRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current !== null) clearTimeout(watchdogTimerRef.current)
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
      if (armedTimerRef.current !== null) clearTimeout(armedTimerRef.current)
    }
  }, [])

  const reconcileAfterBotTurn = useCallback(async (reason: string) => {
    if (!reconcileWithServerSnapshot) return

    try {
      clientLogger.debug('🤖 Reconciling state after bot turn request', { reason })
      await Promise.resolve(reconcileWithServerSnapshot())
    } catch (error) {
      clientLogger.warn('🤖 Failed to reconcile state after bot turn request', {
        reason,
        error,
      })
    }
  }, [reconcileWithServerSnapshot])

  const scheduleRetry = useCallback((botUserId: string, gameId: string, delayMs: number) => {
    if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = setTimeout(() => {
      lastBotPlayerId.current = null
      lastPlayerIndex.current = null
      armedSignatureRef.current = null
      void triggerBotTurnRef.current?.(botUserId, gameId)
    }, delayMs)
  }, [])

  const triggerBotTurn = useCallback(async (botUserId: string, gameId: string) => {
    // A spectator is not a participant, so the route answers 401/403 – neither a
    // 409 nor "Not bot's turn", so the rejection lands on the retry-then-toast path
    // and shows "Bot move failed" for a game they can only watch. The rejected POST
    // also takes the server's bot lock before the participant check, which can push
    // the real player's own trigger into a 409 retry cycle (#1014). The monitor
    // effect below already refuses to run for a spectator; the exported trigger,
    // which the pages' turn-timeout fallbacks call, did not.
    if (isSpectator) return

    if (botTurnInProgress.current) {
      clientLogger.log('🤖 Bot turn already in progress, skipping...')
      return
    }

    botTurnInProgress.current = true

    // Watchdog: if bot turn hangs, force-unlock and retry silently
    watchdogTimerRef.current = setTimeout(() => {
      if (!botTurnInProgress.current) return
      clientLogger.warn('🤖 Bot turn watchdog fired — force-unlocking', { botUserId })
      botTurnInProgress.current = false
      void reconcileAfterBotTurn('watchdog')
      scheduleRetry(botUserId, gameId, RETRY_DELAY_MS)
    }, WATCHDOG_MS)

    clientLogger.log('🤖 Triggering bot turn for:', botUserId)

    try {
      const response = await fetchWithGuest(`/api/game/${gameId}/bot-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botUserId, lobbyCode: code }),
      })

      const responseData = await response.json().catch(() => ({} as Record<string, unknown>))
      if (!response.ok) {
        const error = responseData as { error?: string }

        // 409 – this exact turn is already being played, or already was, by
        // whoever holds the route's lock. #1049: this used to clear the refs and
        // POST again two seconds later, which is how one bot turn ended in a
        // "Not bot's turn" 400 – by then the bot had moved and the turn was back
        // with the human. There is nothing to retry into. Reconcile instead: if
        // the fresh state still has the bot on turn, the monitor below arms a new
        // request from that state, which is recovery driven by what the server
        // says rather than by a timer.
        if (response.status === 409) {
          clientLogger.debug('🤖 Bot turn skipped (409 concurrent execution):', { status: response.status })
          lastBotPlayerId.current = null
          lastPlayerIndex.current = null
          armedSignatureRef.current = null
          retryAttemptRef.current = 0
          await reconcileAfterBotTurn('bot-turn-conflict')
          return
        }

        // 400 "Not bot's turn" — just reset refs, no retry needed
        if (error.error === "Not bot's turn") {
          clientLogger.debug('🤖 Not bot\'s turn — resetting tracking')
          lastBotPlayerId.current = null
          lastPlayerIndex.current = null
          armedSignatureRef.current = null
          retryAttemptRef.current = 0
          return
        }

        clientLogger.error('🤖 Bot turn API error:', { status: response.status, error })
        if (retryAttemptRef.current < MAX_BOT_RETRIES) {
          retryAttemptRef.current++
          clientLogger.warn(`🤖 Retrying bot turn (attempt ${retryAttemptRef.current}/${MAX_BOT_RETRIES})`)
          scheduleRetry(botUserId, gameId, RETRY_DELAY_MS)
          return
        }
        retryAttemptRef.current = 0
        // Same reasoning as the network-error path below: giving up without
        // clearing the refs leaves isSameTurn true, so the monitor never fires
        // again and the board sits on the bot's turn until a broadcast happens
        // to land (#1002).
        lastBotPlayerId.current = null
        lastPlayerIndex.current = null
        showToast.error('toast.botMoveFailed')
        await reconcileAfterBotTurn('bot-turn-failed')
        return
      }

      retryAttemptRef.current = 0
      clientLogger.log('🤖 Bot turn completed:', responseData)

      // Every failure path above reconciles or retries; success used to be the
      // only one with no safety net. The route answers 200 once the move is
      // applied and persisted, and sends the new state on a fire-and-forget
      // broadcast whose result it discards — so a broadcast that never lands
      // left this board on the bot's turn forever while the server had moved
      // on to the human. Who then lost on time for a turn they were never
      // shown, because the timer reads lastMoveAt from this stale state (#859).
      await reconcileAfterBotTurn('bot-turn-complete')
    } catch (error) {
      clientLogger.error('🤖 Bot turn error:', error)
      if (retryAttemptRef.current < MAX_BOT_RETRIES) {
        retryAttemptRef.current++
        clientLogger.warn(`🤖 Retrying bot turn after error (attempt ${retryAttemptRef.current}/${MAX_BOT_RETRIES})`)
        scheduleRetry(botUserId, gameId, RETRY_DELAY_MS)
      } else {
        retryAttemptRef.current = 0
        // Clear refs before reconcile: reconcile delivers fresh state → effect re-runs →
        // without clearing refs isSameTurn would be true and the bot would stay frozen
        lastBotPlayerId.current = null
        lastPlayerIndex.current = null
        showToast.error('toast.botMoveFailed')
        await reconcileAfterBotTurn('bot-turn-error')
      }
    } finally {
      if (watchdogTimerRef.current !== null) {
        clearTimeout(watchdogTimerRef.current)
        watchdogTimerRef.current = null
      }
      botTurnInProgress.current = false
    }
  }, [code, isSpectator, reconcileAfterBotTurn, scheduleRetry])

  // Keep ref current for retry self-calls
  triggerBotTurnRef.current = triggerBotTurn

  // Monitor for bot turns
  useEffect(() => {
    if (isSpectator) {
      cancelArmedTrigger()
      return
    }
    if (!isGameStarted || !gameEngine || !game?.id || !game?.players || !Array.isArray(game.players)) {
      clientLogger.debug('🤖 [BOT-TURN-MONITOR] Skipping - preconditions not met:', {
        isGameStarted,
        hasGameEngine: !!gameEngine,
        hasGameId: !!game?.id,
        hasPlayers: !!game?.players,
        isPlayersArray: game?.players ? Array.isArray(game.players) : false
      })
      cancelArmedTrigger()
      return
    }

    const gameState = gameEngine.getState()

    // Don't trigger if game is finished
    if (gameState.status !== 'playing') {
      cancelArmedTrigger()
      return
    }

    const currentPlayer = gameEngine.getCurrentPlayer()
    if (!currentPlayer) {
      cancelArmedTrigger()
      return
    }

    const currentPlayerIndex = gameState.currentPlayerIndex

    // Find the current player in the game.players array
    const currentGamePlayer = game.players.find(
      (p) => p.userId === currentPlayer.id
    )

    if (!currentGamePlayer || !currentGamePlayer.user) {
      clientLogger.warn('🤖 [BOT-TURN-MONITOR] Current player not found in game.players or missing user data', {
        currentPlayerId: currentPlayer.id,
        availablePlayers: game.players.map(p => ({
          userId: p.userId,
          hasUser: !!p.user,
          hasBot: p.user ? !!p.user.bot : false
        }))
      })
      cancelArmedTrigger()
      return
    }

    // Check if current player is a bot (using bot relation)
    const isBot = !!currentGamePlayer.user.bot

    clientLogger.debug('🤖 [BOT-TURN-MONITOR] Turn check:', {
      currentPlayerId: currentPlayer.id,
      currentPlayerIndex,
      isBot,
      hasBotRelation: !!currentGamePlayer.user.bot,
      botData: currentGamePlayer.user.bot,
    })

    if (!isBot) {
      // Not a bot turn: drop anything still armed, so a request cannot arrive
      // after the turn has come back to a human – which is the 400 half of #1049.
      cancelArmedTrigger()
      lastBotPlayerId.current = null
      lastPlayerIndex.current = currentPlayerIndex
      return
    }

    const signature = `${game.id}:${currentPlayer.id}:${currentPlayerIndex}:${gameState.lastMoveAt ?? 'none'}`
    currentTurnSignatureRef.current = signature
    if (armedSignatureRef.current === signature) {
      // Already waiting on this exact state – a re-render is not a new turn.
      return
    }

    /**
     * How long the monitor waits before sending a bot-turn request of its own (#1049).
     *
     * A bot turn already has a server-side driver. `POST /api/game/[gameId]/state`
     * fires one from inside `after()` the moment a human's move hands the turn over
     * (`triggerSource: 'state-route-auto'`), and `POST /api/game/create` does the same
     * when a bot is first to act. Firing at the same instant from here only races it,
     * and the race is lost by construction: the route takes an in-memory lock before
     * it does anything, so whichever request is second gets a 409 for a turn that is
     * being played correctly.
     *
     * The wait is not a constant. A bot turn can be several commits with pauses
     * between them, and the client sees nothing during a pause - so the wait has to
     * outlast the longest pause the game's own executor codes for, which is what
     * `resolveBotTurnGraceMs` returns. A hand-picked 2500 ms was 189 ms longer than
     * the Memory bot's mismatch pause at the default difficulty, which is inside the
     * cost of one database write, so Memory kept taking the 409 this ticket is about.
     *
     * Nothing chains one bot to the next, so a turn that follows *another bot's* turn
     * has no server-side driver and is still triggered at once - see `followsAnotherBot`
     * below. Everything else waits out the grace and is cancelled if the turn moves
     * on, which it does as soon as the bot's next move broadcasts.
     */
    // The seat changing hands from one bot to another is the one hop nothing
    // triggers server-side, so it goes out at once and keeps the pace it had.
    // Everything else – the bot's own turn progressing move by move, or a turn
    // handed over by a human – waits, because the server is already on it.
    const followsAnotherBot =
      lastPlayerIndex.current !== null &&
      lastPlayerIndex.current !== currentPlayerIndex &&
      lastBotPlayerId.current !== null &&
      lastBotPlayerId.current !== currentPlayer.id

    const delayMs = followsAnotherBot
      ? 0
      : resolveBotTurnGraceMs(isBotPacedGameType(gameType) ? gameType : null)

    clientLogger.log('🤖 Bot turn detected, arming bot move trigger...', { delayMs })

    // Update tracking variables before arming
    lastBotPlayerId.current = currentPlayer.id
    lastPlayerIndex.current = currentPlayerIndex

    const botUserId = currentPlayer.id
    const gameId = game.id
    if (armedTimerRef.current !== null) clearTimeout(armedTimerRef.current)
    armedSignatureRef.current = signature

    // Set once this trigger has had to wait for another request to finish.
    let waitedOnOpenRequest = false
    let askedAfterOpenRequest = false

    const fire = () => {
      armedTimerRef.current = null

      // A request is still open – usually the previous bot's, whose last commit
      // is broadcast before its response arrives. Firing now would be dropped as
      // "already in progress" while this signature stays armed, so the next bot
      // sat until the turn timer's fallback: 30 s per hop in a Ludo game with
      // three bots (#1084). Wait for the open request instead.
      if (botTurnInProgress.current) {
        waitedOnOpenRequest = true
        armedTimerRef.current = setTimeout(fire, BOT_BUSY_RECHECK_MS)
        return
      }

      // That request may well have been this very bot's, and then the turn it
      // was waiting for is over and the broadcast is merely late. Ask the server
      // before writing, whatever this trigger already knew, and only fire if the
      // turn still belongs to this bot after the answer has had time to render
      // (#1102: the re-check used to fire straight into a "Not bot's turn" 400).
      if (waitedOnOpenRequest && !askedAfterOpenRequest) {
        askedAfterOpenRequest = true
        void reconcileAfterBotTurn('bot-turn-open-request-finished')
        armedTimerRef.current = setTimeout(fire, BOT_COMMIT_DELIVERY_ALLOWANCE_MS)
        return
      }
      if (waitedOnOpenRequest && currentTurnSignatureRef.current !== signature) {
        armedSignatureRef.current = null
        return
      }

      // Measured on localhost on 2026-09-20 in a Yahtzee game against an Easy
      // bot: the bot took the turn at t=13.5s, its `bot-action` events arrived
      // through to "scores 17 in Chance" at t=16.3s, and no `game-update` for
      // that final commit reached the tab before the grace expired at t=17.3s.
      // The turn had been the human's for a second by then, so the request was
      // a wasted write answered "Not bot's turn" - the 400 half of #1049, with
      // the pacing already correct. The grace expiring says nothing has reached
      // this tab, not that the bot is stuck, so ask the server before writing.
      // Not for a bot following another bot: that hop has no server-side driver
      // at all, so there is nothing for a read to find and the turn would just
      // be slower by an allowance.
      if (!followsAnotherBot && reconcileWithServerSnapshot && reconciledSignatureRef.current !== signature) {
        reconciledSignatureRef.current = signature
        void reconcileAfterBotTurn('bot-turn-grace-expired')
        // Armed here rather than left to the reconcile's re-render: fresh state
        // that matches what this tab already has renders nothing new, and a bot
        // that really is stuck would then never be kicked at all.
        armedTimerRef.current = setTimeout(fire, BOT_COMMIT_DELIVERY_ALLOWANCE_MS)
        return
      }

      void triggerBotTurn(botUserId, gameId)
    }

    armedTimerRef.current = setTimeout(fire, delayMs)
  }, [
    isSpectator,
    isGameStarted,
    gameEngine,
    game?.id,
    game?.players,
    gameType,
    triggerBotTurn,
    cancelArmedTrigger,
    reconcileWithServerSnapshot,
    reconcileAfterBotTurn,
  ])

  return {
    triggerBotTurn,
  }
}
