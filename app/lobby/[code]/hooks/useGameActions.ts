import { useState, useCallback, useRef, useEffect } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import toast from 'react-hot-toast'
import { RollHistoryEntry } from '@/components/RollHistory'
import { detectPatternOnRoll, detectCelebration, CelebrationEvent } from '@/lib/celebrations'
import { Game } from '@/types/game'

interface UseGameActionsProps {
  game: Game | null
  gameEngine: YahtzeeGame | null
  setGameEngine: (engine: YahtzeeGame | null) => void
  isGuest: boolean
  guestId: string
  userId: string | undefined
  username: string
  isMyTurn: boolean
  emitWhenConnected: (event: string, data: Record<string, unknown>) => void
  code: string
  setRollHistory: React.Dispatch<React.SetStateAction<RollHistoryEntry[]>>
  setCelebrationEvent: React.Dispatch<React.SetStateAction<CelebrationEvent | null>>
  setTimerActive: (active: boolean) => void
  celebrate: () => void
  fireworks: () => void
}

export function useGameActions(props: UseGameActionsProps) {
  const {
    game,
    gameEngine,
    setGameEngine,
    isGuest,
    guestId,
    userId,
    username,
    isMyTurn,
    emitWhenConnected,
    code,
    setRollHistory,
    setCelebrationEvent,
    setTimerActive,
    celebrate,
    fireworks,
  } = props

  const [isMoveInProgress, setIsMoveInProgress] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [isScoring, setIsScoring] = useState(false)
  
  // Local held state - purely client-side between rolls
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false])

  // Sync held state when game state changes
  useEffect(() => {
    if (!gameEngine) return
    
    const serverHeld = gameEngine.getHeld()
    const rollsLeft = gameEngine.getRollsLeft()
    
    // Reset held state at the start of a new turn (rollsLeft === 3)
    if (rollsLeft === 3) {
      setHeld([false, false, false, false, false])
    }
    // Always sync with server state when it's not our turn
    // This ensures we see the correct held dice during bot turns
    else if (!isMyTurn) {
      setHeld(serverHeld)
    }
  }, [gameEngine, isMyTurn])

  const handleRollDice = useCallback(async () => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    if (isMoveInProgress) {
      clientLogger.log('Move already in progress, ignoring')
      return
    }

    if (!isMyTurn) {
      toast.error('🚫 It\'s not your turn to roll the dice!')
      return
    }

    if (gameEngine.getRollsLeft() === 0) {
      toast.error('🚫 No rolls left! Choose a category to score.')
      return
    }

    setIsMoveInProgress(true)
    setIsRolling(true)

    // Send atomic roll with current held state
    const move: Move = {
      playerId: userId || '',
      type: 'roll',
      data: { held }, // Include held array in roll move
      timestamp: new Date(),
    }

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (isGuest && guestId) {
        headers['X-Guest-Id'] = guestId
      }
      
      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to roll dice')
      }

      const data = await res.json()
      
      let newEngine: YahtzeeGame | null = null
      if (gameEngine) {
        newEngine = new YahtzeeGame(gameEngine.getState().id)
        newEngine.restoreState(data.game.state)
        setGameEngine(newEngine)
        
        // Update local held state from server (source of truth)
        setHeld(newEngine.getHeld())

        const currentPlayer = newEngine.getCurrentPlayer()
        const rollNumber = 3 - newEngine.getRollsLeft()
        const newEntry: RollHistoryEntry = {
          id: `${Date.now()}_${Math.random()}`,
          turnNumber: Math.floor(newEngine.getRound() / (game?.players?.length || 1)) + 1,
          playerName: currentPlayer?.name || username || 'You',
          rollNumber: rollNumber,
          dice: newEngine.getDice(),
          held: newEngine.getHeld().map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1),
          timestamp: Date.now(),
          isBot: false,
        }
        setRollHistory(prev => [...prev.slice(-9), newEntry])

        const celebration = detectPatternOnRoll(newEngine.getDice())
        if (celebration) {
          // Check if the category is still available before celebrating
          const scorecard = newEngine.getScorecard(userId || '')
          const categoryMap: Record<string, YahtzeeCategory> = {
            'yahtzee': 'yahtzee',
            'largeStraight': 'largeStraight',
            'fullHouse': 'fullHouse'
          }
          const category = categoryMap[celebration.type]
          
          // Only show celebration if category is available (undefined in scorecard)
          if (!category || !scorecard || scorecard[category] === undefined) {
            setCelebrationEvent(celebration)
            celebrate() // Trigger confetti animation
          }
        }
      }
      
      soundManager.play('diceRoll')
      
      emitWhenConnected('game-action', {
        lobbyCode: code,
        action: 'state-change',
        payload: {
          state: data.game.state,
        },
      })
    } catch (error: any) {
      toast.error(error.message || 'Failed to roll dice')
    } finally {
      setIsMoveInProgress(false)
      setIsRolling(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, username, code, held, setGameEngine, setRollHistory, setCelebrationEvent, emitWhenConnected, celebrate])

  const handleToggleHold = useCallback((diceIndex: number) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return
    
    if (!isMyTurn) {
      toast.error('🚫 It\'s not your turn!')
      return
    }

    // Don't allow holds while rolling or scoring
    if (isRolling || isScoring) {
      clientLogger.log('Cannot hold dice while move in progress')
      return
    }

    // Toggle held state locally - instant feedback, no HTTP request
    setHeld(prevHeld => {
      const newHeld = [...prevHeld]
      newHeld[diceIndex] = !newHeld[diceIndex]
      return newHeld
    })
    
    soundManager.play('click')
  }, [gameEngine, game, isMyTurn, isRolling, isScoring])

  const handleScore = useCallback(async (category: YahtzeeCategory) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    if (isMoveInProgress) {
      clientLogger.log('Move already in progress, ignoring')
      return
    }

    if (!isMyTurn) {
      toast.error('🚫 It\'s not your turn!')
      return
    }

    // Check if category is already filled
    const scorecard = gameEngine.getScorecard(userId || '')
    if (scorecard && scorecard[category] !== undefined) {
      // Category already filled - silently ignore (UI should prevent this)
      clientLogger.log('Category already filled, ignoring click')
      return
    }

    setIsMoveInProgress(true)
    setIsScoring(true)

    const move: Move = {
      playerId: userId || '',
      type: 'score',
      data: { category },
      timestamp: new Date(),
    }

    try {
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (isGuest && guestId) {
        headers['X-Guest-Id'] = guestId
      }

      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to score')
      }

      const data = await res.json()
      const newEngine = new YahtzeeGame(gameEngine.getState().id)
      newEngine.restoreState(data.game.state)
      setGameEngine(newEngine)
      
      // Reset local held state for next turn
      setHeld([false, false, false, false, false])

      // Calculate score for celebration detection
      const scoredValue = calculateScore(gameEngine.getDice(), category)
      
      // Check if this score deserves a celebration
      const celebration = detectCelebration(gameEngine.getDice(), category, scoredValue)
      if (celebration) {
        setCelebrationEvent(celebration)
        celebrate() // Trigger confetti for good scores
      }

      soundManager.play('score')

      emitWhenConnected('game-action', {
        lobbyCode: code,
        action: 'state-change',
        payload: {
          state: data.game.state,
        },
      })

      if (newEngine.isGameFinished()) {
        setTimerActive(false)
        const winner = newEngine.checkWinCondition()
        if (winner) {
          soundManager.play('win')
          fireworks()
          toast.success(`🎉 Game Over! ${winner.name} wins!`)
        }
      } else {
        const nextPlayer = newEngine.getCurrentPlayer()
        // Only show "next turn" toast if it's NOT our turn now
        // (don't show to the player who just scored)
        if (nextPlayer && nextPlayer.id !== userId) {
          soundManager.play('turnChange')
          toast(`${nextPlayer.name}'s turn!`, { icon: 'ℹ️' })
        } else {
          soundManager.play('turnChange')
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to score')
    } finally {
      setIsMoveInProgress(false)
      setIsScoring(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, code, setGameEngine, setCelebrationEvent, celebrate, emitWhenConnected, setTimerActive, fireworks])

  return {
    handleRollDice,
    handleToggleHold,
    handleScore,
    isMoveInProgress,
    isRolling,
    isScoring,
    held, // Export local held state for UI
  }
}
