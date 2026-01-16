import { useState, useCallback } from 'react'
import { SpyGame } from '@/lib/games/spy-game'
import { GameEngine } from '@/lib/game-engine'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/socket-url'
import toast from 'react-hot-toast'
import { Game } from '@/types/game'

interface UseSpyActionsProps {
  game: Game | null
  gameEngine: GameEngine | null
  setGameEngine: (engine: GameEngine | null) => void
  isGuest: boolean
  guestId: string
  guestName: string
  userId: string | undefined
  setGame: React.Dispatch<React.SetStateAction<Game | null>>
}

export function useSpyActions(props: UseSpyActionsProps) {
  const {
    game,
    gameEngine,
    setGameEngine,
    isGuest,
    guestId,
    guestName,
    userId,
    setGame,
  } = props

  const [isActionInProgress, setIsActionInProgress] = useState(false)

  const performSpyAction = useCallback(async (action: string, data?: Record<string, unknown>) => {
    if (!game?.id || !userId || isActionInProgress) return

    setIsActionInProgress(true)
    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName)
      
      const res = await fetch(`/api/game/${game.id}/spy-action`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, data }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to perform action')
      }

      // Update game engine with new state
      if (result.state) {
        if (gameEngine) {
          gameEngine.restoreState(result.state)
          setGameEngine(gameEngine)
        } else {
          // Create engine if it doesn't exist
          const { GameRegistry } = await import('@/lib/game-registry')
          const newEngine = GameRegistry.createEngine(
            game.id,
            'guess_the_spy',
            { maxPlayers: 10, minPlayers: 1 }
          )
          newEngine.restoreState(result.state)
          setGameEngine(newEngine)
        }
        
        // Update game object
        setGame((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            state: JSON.stringify(result.state),
          }
        })
      }

      return result
    } catch (error: any) {
      clientLogger.error('Spy action error:', error)
      toast.error(error.message || 'Failed to perform action')
      throw error
    } finally {
      setIsActionInProgress(false)
    }
  }, [game, userId, isGuest, guestId, guestName, gameEngine, setGameEngine, setGame, isActionInProgress])

  const handlePlayerReady = useCallback(async () => {
    await performSpyAction('player-ready')
  }, [performSpyAction])

  const handleAskQuestion = useCallback(async (targetId: string, question: string) => {
    await performSpyAction('ask-question', { targetId, question })
  }, [performSpyAction])

  const handleAnswerQuestion = useCallback(async (answer: string) => {
    await performSpyAction('answer-question', { answer })
  }, [performSpyAction])

  const handleSkipTurn = useCallback(async () => {
    await performSpyAction('skip-turn')
  }, [performSpyAction])

  const handleVote = useCallback(async (targetId: string) => {
    await performSpyAction('vote', { targetId })
  }, [performSpyAction])

  const initializeRound = useCallback(async () => {
    if (!game?.id || !userId) return

    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName)
      
      const res = await fetch(`/api/game/${game.id}/spy-init`, {
        method: 'POST',
        headers,
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to initialize round')
      }

      // Update game engine with new state
      if (result.state && gameEngine) {
        gameEngine.restoreState(result.state)
        setGameEngine(gameEngine)
        
        setGame((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            state: JSON.stringify(result.state),
          }
        })
      } else if (result.state) {
        // If gameEngine is null, create it
        const { GameRegistry } = await import('@/lib/game-registry')
        const newEngine = GameRegistry.createEngine(
          game.id,
          'guess_the_spy',
          { maxPlayers: 10, minPlayers: 1 }
        )
        newEngine.restoreState(result.state)
        setGameEngine(newEngine as any)
        
        setGame((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            state: JSON.stringify(result.state),
          }
        })
      }

      toast.success('Round started!')
      return result
    } catch (error: any) {
      clientLogger.error('Spy init error:', error)
      toast.error(error.message || 'Failed to initialize round')
      throw error
    }
  }, [game, userId, isGuest, guestId, guestName, gameEngine, setGameEngine, setGame])

  return {
    handlePlayerReady,
    handleAskQuestion,
    handleAnswerQuestion,
    handleSkipTurn,
    handleVote,
    initializeRound,
    isActionInProgress,
  }
}
