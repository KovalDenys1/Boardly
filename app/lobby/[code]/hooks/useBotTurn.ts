import { useEffect, useRef, useCallback } from 'react'
import { GameEngine } from '@/lib/game-engine'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const MAX_BOT_RETRIES = 2
const WATCHDOG_MS = 14_000
const RETRY_DELAY_MS = 2_000

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
  reconcileWithServerSnapshot?: () => Promise<void> | void
}

export function useBotTurn({
  game,
  gameEngine,
  code,
  isGameStarted,
  reconcileWithServerSnapshot,
}: UseBotTurnProps) {
  const botTurnInProgress = useRef(false)
  const lastBotPlayerId = useRef<string | null>(null)
  const lastPlayerIndex = useRef<number | null>(null)
  const retryAttemptRef = useRef(0)
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref to always hold the latest triggerBotTurn for self-referencing retries
  const triggerBotTurnRef = useRef<((botUserId: string, gameId: string) => Promise<void>) | null>(null)

  useEffect(() => {
    return () => {
      if (watchdogTimerRef.current !== null) clearTimeout(watchdogTimerRef.current)
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current)
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
      void triggerBotTurnRef.current?.(botUserId, gameId)
    }, delayMs)
  }, [])

  const triggerBotTurn = useCallback(async (botUserId: string, gameId: string) => {
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

        // Expected race conditions — silent skip, no retry
        if (response.status === 409 || error.error === "Not bot's turn") {
          clientLogger.debug('🤖 Bot turn request skipped (expected race condition):', { status: response.status, error: error.error })
          if (error.error === "Not bot's turn") {
            lastBotPlayerId.current = null
            lastPlayerIndex.current = null
          }
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
        showToast.error('toast.botMoveFailed')
        return
      }

      retryAttemptRef.current = 0
      clientLogger.log('🤖 Bot turn completed:', responseData)
    } catch (error) {
      clientLogger.error('🤖 Bot turn error:', error)
      if (retryAttemptRef.current < MAX_BOT_RETRIES) {
        retryAttemptRef.current++
        clientLogger.warn(`🤖 Retrying bot turn after error (attempt ${retryAttemptRef.current}/${MAX_BOT_RETRIES})`)
        scheduleRetry(botUserId, gameId, RETRY_DELAY_MS)
      } else {
        retryAttemptRef.current = 0
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
  }, [code, reconcileAfterBotTurn, scheduleRetry])

  // Keep ref current for retry self-calls
  triggerBotTurnRef.current = triggerBotTurn

  // Monitor for bot turns
  useEffect(() => {
    if (!isGameStarted || !gameEngine || !game?.id || !game?.players || !Array.isArray(game.players)) {
      clientLogger.debug('🤖 [BOT-TURN-MONITOR] Skipping - preconditions not met:', {
        isGameStarted,
        hasGameEngine: !!gameEngine,
        hasGameId: !!game?.id,
        hasPlayers: !!game?.players,
        isPlayersArray: game?.players ? Array.isArray(game.players) : false
      })
      return
    }

    const gameState = gameEngine.getState()

    // Don't trigger if game is finished
    if (gameState.status !== 'playing') {
      return
    }

    const currentPlayer = gameEngine.getCurrentPlayer()
    if (!currentPlayer) {
      return
    }

    // Check if it's a new turn - player index changed OR it's a different bot
    const currentPlayerIndex = gameState.currentPlayerIndex
    const isSameTurn =
      lastPlayerIndex.current === currentPlayerIndex &&
      lastBotPlayerId.current === currentPlayer.id

    if (isSameTurn) {
      // Same turn as before, don't trigger again
      return
    }

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

    if (isBot) {
      clientLogger.log('🤖 Bot turn detected, triggering bot move...')

      // Update tracking variables before triggering
      lastBotPlayerId.current = currentPlayer.id
      lastPlayerIndex.current = currentPlayerIndex

      // Trigger immediately when turn starts.
      // We keep in-hook locking/race guards in triggerBotTurn for safety.
      void triggerBotTurn(currentPlayer.id, game.id)
    } else {
      // Not a bot turn, reset tracking
      lastBotPlayerId.current = null
      lastPlayerIndex.current = currentPlayerIndex
    }
  }, [isGameStarted, gameEngine, game?.id, game?.players, triggerBotTurn])

  return {
    triggerBotTurn,
  }
}
