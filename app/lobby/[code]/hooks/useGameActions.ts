import { useState, useCallback, useEffect, useRef } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { GameEngine, Move } from '@/lib/game-engine'
import { restoreGameEngine } from '@/lib/game-registry'
import { YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/socket-url'
import { showToast } from '@/lib/i18n-toast'
import { RollHistoryEntry } from '@/components/RollHistory'
import { detectPatternOnRoll, detectCelebration, CelebrationEvent } from '@/lib/celebrations'
import { Game, GamePlayer } from '@/types/game'
import { trackPlayerAction, trackGameCompleted } from '@/lib/analytics'

interface UseGameActionsProps {
  game: Game | null
  gameEngine: GameEngine | null
  setGameEngine: (engine: GameEngine | null) => void
  isGuest: boolean
  guestId: string | null
  guestName: string | null
  guestToken: string | null
  userId: string | null | undefined
  username: string | null
  isMyTurn: boolean
  emitWhenConnected: (event: string, data: Record<string, unknown>) => void
  code: string
  setRollHistory: React.Dispatch<React.SetStateAction<RollHistoryEntry[]>>
  setCelebrationEvent: React.Dispatch<React.SetStateAction<CelebrationEvent | null>>
  setTimerActive: (active: boolean) => void
  celebrate: () => void
  fireworks: () => void
  reconcileWithServerSnapshot: () => Promise<void>
}

export interface AutoActionContext {
  source: 'turn-timeout'
  debounceKey: string
  turnSnapshot: {
    currentPlayerId: string
    currentPlayerIndex: number
    lastMoveAt: number | null
    rollsLeft: number
    updatedAt: string | number | null
  }
}

function isAutoActionContext(value: unknown): value is AutoActionContext {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<AutoActionContext>
  return (
    candidate.source === 'turn-timeout' &&
    typeof candidate.debounceKey === 'string' &&
    !!candidate.turnSnapshot &&
    typeof candidate.turnSnapshot.currentPlayerId === 'string'
  )
}

function isExpectedAutoActionSkip(status: number, error: any): boolean {
  if (status === 202) return true
  if (status === 409) return true

  const code = error?.code
  return code === 'TURN_ALREADY_ENDED' || code === 'AUTO_ACTION_DEBOUNCED' || code === 'STATE_CONFLICT'
}

export function useGameActions(props: UseGameActionsProps) {
  const {
    game,
    gameEngine,
    setGameEngine,
    isGuest,
    guestId,
    guestName,
    guestToken,
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
    reconcileWithServerSnapshot,
  } = props

  const [isMoveInProgress, setIsMoveInProgress] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [isScoring, setIsScoring] = useState(false)
  const [isStateReverting, setIsStateReverting] = useState(false)
  const rollbackIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Local held state - purely client-side between rolls
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false])

  const triggerRollbackIndicator = useCallback(() => {
    if (rollbackIndicatorTimeoutRef.current) {
      clearTimeout(rollbackIndicatorTimeoutRef.current)
    }

    setIsStateReverting(true)
    rollbackIndicatorTimeoutRef.current = setTimeout(() => {
      setIsStateReverting(false)
      rollbackIndicatorTimeoutRef.current = null
    }, 1800)
  }, [])

  const reconcileAfterMoveError = useCallback(async () => {
    try {
      await reconcileWithServerSnapshot()
      triggerRollbackIndicator()
      return true
    } catch (error) {
      clientLogger.warn('Failed to reconcile state after move error', error)
      return false
    }
  }, [reconcileWithServerSnapshot, triggerRollbackIndicator])

  useEffect(() => {
    return () => {
      if (rollbackIndicatorTimeoutRef.current) {
        clearTimeout(rollbackIndicatorTimeoutRef.current)
      }
    }
  }, [])

  // Sync held state when game state changes
  useEffect(() => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame)) return

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

  const handleRollDice = useCallback(async (autoActionContext?: unknown): Promise<GameEngine | null> => {
    const normalizedAutoActionContext = isAutoActionContext(autoActionContext)
      ? autoActionContext
      : undefined
    const isAutoAction = !!normalizedAutoActionContext
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return null

    const preMoveHeld = [...gameEngine.getHeld()]

    if (isMoveInProgress) {
      clientLogger.log('Move already in progress, ignoring')
      return null
    }

    if (!isMyTurn) {
      if (!isAutoAction) {
        showToast.error('toast.notYourTurnRoll')
      }
      return null
    }

    if (gameEngine.getRollsLeft() === 0) {
      if (!isAutoAction) {
        showToast.error('toast.noRollsLeft')
      }
      return null
    }

    setIsMoveInProgress(true)
    setIsRolling(true)

    // Play sound immediately for instant feedback (force to ensure it plays)
    soundManager.play('diceRoll', { force: true })

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
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)

      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move, autoActionContext: normalizedAutoActionContext }),
      })

      // Auto-actions can be debounced/ignored server-side by design.
      if (isAutoAction && res.status === 202) {
        return null
      }

      if (!res.ok) {
        const error = await res.json()
        if (isAutoAction && isExpectedAutoActionSkip(res.status, error)) {
          clientLogger.log('⏱️ Auto roll skipped by server guard', { status: res.status, code: error?.code })
          return null
        }
        throw new Error(error.error || 'Failed to roll dice')
      }

      const data = await res.json()
      if (!data?.game?.state) {
        if (isAutoAction) return null
        throw new Error('Invalid server response')
      }

      // Replace optimistic update with real server data
      let newEngine: YahtzeeGame | null = null
      if (gameEngine) {
        newEngine = restoreGameEngine('yahtzee', gameEngine.getState().id, data.game.state) as YahtzeeGame
        setGameEngine(newEngine)

        // Update local held state from server (source of truth)
        setHeld(newEngine.getHeld())

        const currentPlayer = newEngine.getCurrentPlayer()
        const rollNumber = 3 - newEngine.getRollsLeft()
        const newEntry: RollHistoryEntry = {
          id: `${Date.now()}_${Math.random()}`,
          turnNumber: newEngine.getRound(),
          playerName: currentPlayer?.name || username || 'You',
          rollNumber: rollNumber,
          dice: newEngine.getDice(),
          held: newEngine.getHeld().map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1),
          timestamp: Date.now(),
          isBot: false,
        }
        setRollHistory(prev => [...prev.slice(-19), newEntry])

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

          // Only show celebration if category exists AND is still available (undefined in scorecard)
          if (category && scorecard && scorecard[category] === undefined) {
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
            rollNumber: 3 - newEngine.getRollsLeft(),
            diceHeld: held.filter(Boolean).length,
          },
        })
      }

      if (data.serverBroadcasted !== true) {
        emitWhenConnected('game-action', {
          lobbyCode: code,
          action: 'state-change',
          payload: data.game.state,
        })
        void reconcileWithServerSnapshot()
      }

      return newEngine
    } catch (error: any) {
      if (!isAutoAction) {
        setHeld(preMoveHeld)
        await reconcileAfterMoveError()
        showToast.errorFrom(error, 'toast.rollFailed')
      } else {
        clientLogger.log('⏱️ Auto roll failed or skipped', { message: error?.message })
      }
      return null
    } finally {
      setIsMoveInProgress(false)
      setIsRolling(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, guestName, guestToken, username, code, held, setGameEngine, setRollHistory, setCelebrationEvent, emitWhenConnected, celebrate, reconcileWithServerSnapshot, reconcileAfterMoveError])

  const handleToggleHold = useCallback((diceIndex: number) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    if (!isMyTurn) {
      showToast.error('toast.notYourTurn')
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
    // Sound is now played in Dice component for instant feedback
  }, [gameEngine, game, isMyTurn, isRolling, isScoring])

  const handleScore = useCallback(async (category: YahtzeeCategory, autoActionContext?: unknown): Promise<GameEngine | null> => {
    const normalizedAutoActionContext = isAutoActionContext(autoActionContext)
      ? autoActionContext
      : undefined
    const isAutoAction = !!normalizedAutoActionContext
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return null

    const preMoveHeld = [...gameEngine.getHeld()]

    if (isMoveInProgress) {
      clientLogger.log('Move already in progress, ignoring')
      return null
    }

    if (!isMyTurn) {
      if (!isAutoAction) {
        showToast.error('toast.notYourTurn')
      }
      return null
    }

    // Check if category is already filled
    const scorecard = gameEngine.getScorecard(userId || '')
    if (scorecard && scorecard[category] !== undefined) {
      // Category already filled - silently ignore (UI should prevent this)
      clientLogger.log('Category already filled, ignoring click')
      return null
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
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)

      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move, autoActionContext: normalizedAutoActionContext }),
      })

      // Auto-actions can be debounced/ignored server-side by design.
      if (isAutoAction && res.status === 202) {
        return null
      }

      if (!res.ok) {
        const error = await res.json()
        if (isAutoAction && isExpectedAutoActionSkip(res.status, error)) {
          clientLogger.log('⏱️ Auto score skipped by server guard', { status: res.status, code: error?.code })
          return null
        }
        throw new Error(error.error || 'Failed to score')
      }

      const data = await res.json()
      if (!data?.game?.state) {
        if (isAutoAction) return null
        throw new Error('Invalid server response')
      }
      const newEngine = restoreGameEngine('yahtzee', gameEngine.getState().id, data.game.state) as YahtzeeGame
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

      if (data.serverBroadcasted !== true) {
        emitWhenConnected('game-action', {
          lobbyCode: code,
          action: 'state-change',
          payload: data.game.state,
        })
        void reconcileWithServerSnapshot()
      }

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
          wasBot: !!(winnerPlayer?.user?.bot),
          finalScores: game.players.map((p: GamePlayer) => ({
            playerName: p.name,
            score: p.score,
          })),
        })

        if (winner) {
          fireworks()
          showToast.success('toast.gameOver', undefined, { player: winner.name })
        }
      } else {
        const nextPlayer = newEngine.getCurrentPlayer()
        // Play turn change sound once when turn changes
        soundManager.play('turnChange')

        // Only show "next turn" toast if it's NOT our turn now
        // (don't show to the player who just scored)
        if (nextPlayer && nextPlayer.id !== userId) {
          showToast.custom('toast.playerTurn', 'ℹ️', undefined, { player: nextPlayer.name })
        }
      }

      return newEngine
    } catch (error: any) {
      if (!isAutoAction) {
        setHeld(preMoveHeld)
        await reconcileAfterMoveError()
        showToast.errorFrom(error, 'toast.scoreFailed')
      } else {
        clientLogger.log('⏱️ Auto score failed or skipped', { message: error?.message })
      }
      return null
    } finally {
      setIsMoveInProgress(false)
      setIsScoring(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, guestName, guestToken, code, setGameEngine, setCelebrationEvent, celebrate, emitWhenConnected, setTimerActive, fireworks, reconcileWithServerSnapshot, reconcileAfterMoveError])

  return {
    handleRollDice,
    handleToggleHold,
    handleScore,
    isMoveInProgress,
    isRolling,
    isScoring,
    isStateReverting,
    held, // Export local held state for UI
  }
}
