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
  const lastProcessedTurn = useRef<string | null>(null)

  const triggerBotTurn = useCallback(async (botUserId: string, gameId: string) => {
    if (botTurnInProgress.current) {
      clientLogger.log('🤖 Bot turn already in progress, skipping...')
      return
    }

    const turnKey = `${gameId}-${botUserId}-${gameEngine?.getState().currentPlayerIndex}`
    if (lastProcessedTurn.current === turnKey) {
      clientLogger.log('🤖 Bot turn already processed for this state, skipping...')
      return
    }

    botTurnInProgress.current = true
    lastProcessedTurn.current = turnKey

    clientLogger.log('🤖 Triggering bot turn for:', botUserId)

    try {
      const response = await fetch(`/api/game/${gameId}/bot-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botUserId, lobbyCode: code }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Bot turn failed')
      }

      const data = await response.json()
      clientLogger.log('🤖 Bot turn completed:', data)
    } catch (error) {
      clientLogger.error('🤖 Bot turn error:', error)
      toast.error('Bot failed to make a move')
      lastProcessedTurn.current = null // Allow retry
    } finally {
      botTurnInProgress.current = false
    }
  }, [gameEngine, code])

  // Monitor for bot turns
  useEffect(() => {
    if (!isGameStarted || !gameEngine || !game?.id || !game?.players) {
      return
    }

    const currentPlayer = gameEngine.getCurrentPlayer()
    if (!currentPlayer) {
      return
    }

    // Find the current player in the game.players array
    const currentGamePlayer = game.players.find(
      (p: any) => p.userId === currentPlayer.id
    )

    if (!currentGamePlayer) {
      clientLogger.warn('🤖 Current player not found in game.players')
      return
    }

    // Check if current player is a bot
    const isBot = currentGamePlayer.user?.isBot === true

    if (isBot) {
      clientLogger.log('🤖 Bot turn detected, triggering bot move...')
      // Small delay to allow UI to update
      const timer = setTimeout(() => {
        triggerBotTurn(currentPlayer.id, game.id)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isGameStarted, gameEngine, game?.id, game?.players, triggerBotTurn])

  return {
    triggerBotTurn,
  }
}
