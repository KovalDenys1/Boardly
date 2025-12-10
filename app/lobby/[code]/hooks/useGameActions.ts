import { useState, useCallback, useRef, useEffect } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/socket-url'
import toast from 'react-hot-toast'
import { RollHistoryEntry } from '@/components/RollHistory'
import { detectPatternOnRoll, detectCelebration, CelebrationEvent } from '@/lib/celebrations'
import { Game, GamePlayer } from '@/types/game'
import { trackPlayerAction, trackGameCompleted } from '@/lib/analytics'

interface UseGameActionsProps {
  game: Game | null
  gameEngine: YahtzeeGame | null
  setGameEngine: (engine: YahtzeeGame | null) => void
  isGuest: boolean
  guestId: string
  guestName: string
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
    guestName,
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

    // Play sound immediately for instant feedback
    soundManager.play('diceRoll')
    
    // NOTE: We don't update dice values optimistically because:
    // 1. Client random != server random (will cause "flicker" when values change)
    // 2. isRolling state already shows animation/loading
    // 3. Better UX: show rolling animation → then reveal actual server values

    // Send atomic roll with current held state
    const move: Move = {
      playerId: userId || '',
      type: 'roll',
      data: { held }, // Include held array in roll move
      timestamp: new Date(),
    }

    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName)
      
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
      
      // Replace optimistic update with real server data
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
            'fullHouse': 'fullHouse',
            'perfectRoll': 'fourOfKind' // Map perfectRoll (4 of a kind) to fourOfKind category
          }
          const category = categoryMap[celebration.type]
          
          // Only show celebration if category is available (undefined in scorecard)
          if (!category || !scorecard || scorecard[category] === undefined) {
            setCelebrationEvent(celebration)
            celebrate() // Trigger confetti animation
            
            // Auto-clear celebration after 4 seconds
            setTimeout(() => {
              setCelebrationEvent(null)
            }, 4000)
          }
        }
      }
      
      // Sound already played optimistically, no need to play again
      
      // Track player action
      if (newEngine) {
        trackPlayerAction({
          actionType: 'roll',
          gameType: 'yahtzee',
          playerCount: game.players.length,
          isBot: false,
          metadata: {
            rollNumber: 3 - newEngine.getRollsLeft() + 1,
            diceHeld: held.filter(Boolean).length,
          },
        })
      }
      
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
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, guestName, username, code, held, setGameEngine, setRollHistory, setCelebrationEvent, emitWhenConnected, celebrate])

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
      const headers = getAuthHeaders(isGuest, guestId, guestName)
      
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
      
      // Get the NEW scorecard (after scoring) to verify category is now filled
      const newScorecard = newEngine.getScorecard(userId || '')
      
      // Check if this score deserves a celebration
      // Only celebrate if we just filled this category (it should now be defined in scorecard)
      if (newScorecard && newScorecard[category] !== undefined) {
        const celebration = detectCelebration(gameEngine.getDice(), category, scoredValue)
        if (celebration) {
          setCelebrationEvent(celebration)
          celebrate() // Trigger confetti for good scores
          
          // Auto-clear celebration after 4 seconds
          setTimeout(() => {
            setCelebrationEvent(null)
          }, 4000)
        }
      }

      soundManager.play('score')
      
      // Track score action
      trackPlayerAction({
        actionType: 'score',
        gameType: 'yahtzee',
        playerCount: game.players.length,
        isBot: false,
        metadata: {
          category,
          score: scoredValue,
        },
      })

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
        
        // Track game completion
        const startTime = game.createdAt ? new Date(game.createdAt).getTime() : Date.now()
        const endTime = Date.now()
        const durationMinutes = Math.round((endTime - startTime) / 60000)
        
        // Safety check: ensure game.players exists and is an array
        const winnerPlayer = winner?.id && Array.isArray(game.players) 
          ? game.players.find((p: any) => p.userId === winner.id) 
          : null
        
        trackGameCompleted({
          gameType: 'yahtzee',
          playerCount: game.players.length,
          duration: durationMinutes,
          winner: winner?.name || 'Unknown',
          wasBot: winnerPlayer?.isBot || false,
          finalScores: game.players.map((p: GamePlayer) => ({
            playerName: p.name,
            score: p.score,
          })),
        })
        
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
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, guestName, code, setGameEngine, setCelebrationEvent, celebrate, emitWhenConnected, setTimerActive, fireworks])

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
