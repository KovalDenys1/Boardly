import { useEffect, useRef, useCallback } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { clientLogger } from '@/lib/client-logger'
import toast from 'react-hot-toast'

interface UseBotTurnProps {
  game: any
  gameEngine: YahtzeeGame | null
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
        toast.error('Bot failed to make a move')
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
      (p: any) => p.userId === currentPlayer.id
    )

    if (!currentGamePlayer || !currentGamePlayer.user) {
      clientLogger.warn('🤖 Current player not found in game.players or missing user data')
      return
    }

    // Check if current player is a bot
    const isBot = currentGamePlayer.user.isBot === true

    if (isBot) {
      // Check that bot has rolls available (new turn)
      const rollsLeft = gameEngine.getRollsLeft()
      
      // Only trigger if it's the START of a new turn (all 3 rolls available)
      if (rollsLeft !== 3) {
        clientLogger.log('🤖 Bot turn already in progress (rollsLeft:', rollsLeft, '), skipping trigger')
        // DO NOT update tracking - wait for the turn to complete
        return
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
