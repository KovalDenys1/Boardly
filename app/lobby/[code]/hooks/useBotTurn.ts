import { useEffect, useRef, useCallback } from 'react'
import { GameEngine } from '@/lib/game-engine'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'

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
}

export function useBotTurn({ game, gameEngine, code, isGameStarted }: UseBotTurnProps) {
  const botTurnInProgress = useRef(false)
  const lastBotPlayerId = useRef<string | null>(null)
  const lastPlayerIndex = useRef<number | null>(null)

  const triggerBotTurn = useCallback(async (botUserId: string, gameId: string) => {
    if (botTurnInProgress.current) {
      clientLogger.log('🤖 Bot turn already in progress, skipping...')
      return
    }

    botTurnInProgress.current = true

    clientLogger.log('🤖 Triggering bot turn for:', botUserId)

    try {
      const response = await fetch(`/api/game/${gameId}/bot-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botUserId, lobbyCode: code }),
      })

      if (!response.ok) {
        const error = await response.json()

        // Don't show error toast or log for expected race conditions:
        // - 409: Bot turn already in progress (lock prevented duplicate)
        // - "Not bot's turn": Race condition timing issue
        if (response.status === 409 || error.error === "Not bot's turn") {
          clientLogger.log('🤖 Bot turn request skipped (expected race condition):', { status: response.status, error: error.error })
          return // Silent return, no error thrown
        }

        clientLogger.error('🤖 Bot turn API error:', { status: response.status, error })
        showToast.error('toast.botMoveFailed')
        throw new Error(error.error || 'Bot turn failed')
      }

      const data = await response.json()
      clientLogger.log('🤖 Bot turn completed:', data)
    } catch (error) {
      clientLogger.error('🤖 Bot turn error:', error)
    } finally {
      botTurnInProgress.current = false
    }
  }, [code])

  // Monitor for bot turns
  useEffect(() => {
    if (!isGameStarted || !gameEngine || !game?.id || !game?.players || !Array.isArray(game.players)) {
      clientLogger.log('🤖 [BOT-TURN-MONITOR] Skipping - preconditions not met:', {
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

    clientLogger.log('🤖 [BOT-TURN-MONITOR] Turn check:', {
      currentPlayerId: currentPlayer.id,
      currentPlayerIndex,
      isBot,
      hasBotRelation: !!currentGamePlayer.user.bot,
      botData: currentGamePlayer.user.bot,
      rollsLeft: gameEngine instanceof YahtzeeGame ? gameEngine.getRollsLeft() : 'N/A'
    })

    if (isBot) {
      // For Yahtzee: only trigger at start of new turn (rollsLeft === 3)
      // For other games: trigger immediately on bot's turn
      if (gameEngine instanceof YahtzeeGame) {
        const rollsLeft = gameEngine.getRollsLeft()
        if (rollsLeft !== 3) {
          clientLogger.log('🤖 Bot turn already in progress (rollsLeft:', rollsLeft, '), skipping trigger')
          return
        }
      }

      clientLogger.log('🤖 Bot turn detected, triggering bot move...')

      // Update tracking variables before triggering
      lastBotPlayerId.current = currentPlayer.id
      lastPlayerIndex.current = currentPlayerIndex

      // Small delay to allow UI to update
      const timer = setTimeout(() => {
        triggerBotTurn(currentPlayer.id, game.id)
      }, 1000)
      return () => clearTimeout(timer)
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
