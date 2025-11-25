import { useState, useCallback } from 'react'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { Move } from '@/lib/game-engine'
import { YahtzeeCategory } from '@/lib/yahtzee'
import { soundManager } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import toast from 'react-hot-toast'
import { RollHistoryEntry } from '@/components/RollHistory'
import { detectPatternOnRoll, CelebrationEvent } from '@/lib/celebrations'
import { Game } from '@/types/game'

interface UseGameActionsProps {
  game: Game | null
  gameEngine: YahtzeeGame | null
  setGameEngine: (engine: YahtzeeGame | null) => void
  isGuest: boolean
  guestId: string
  getCurrentUserId: () => string | undefined
  getCurrentUserName: () => string
  isMyTurn: () => boolean
  emitWhenConnected: (event: string, data: Record<string, unknown>) => void
  code: string
  setRollHistory: React.Dispatch<React.SetStateAction<RollHistoryEntry[]>>
  setCelebrationEvent: React.Dispatch<React.SetStateAction<CelebrationEvent | null>>
  setTimerActive: (active: boolean) => void
  fireworks: () => void
}

export function useGameActions(props: UseGameActionsProps) {
  const {
    game,
    gameEngine,
    setGameEngine,
    isGuest,
    guestId,
    getCurrentUserId,
    getCurrentUserName,
    isMyTurn,
    emitWhenConnected,
    code,
    setRollHistory,
    setCelebrationEvent,
    setTimerActive,
    fireworks,
  } = props

  const [isMoveInProgress, setIsMoveInProgress] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [isScoring, setIsScoring] = useState(false)

  const handleRollDice = useCallback(async () => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    if (isMoveInProgress) {
      clientLogger.log('Move already in progress, ignoring')
      return
    }

    if (!isMyTurn()) {
      toast.error('🚫 It\'s not your turn to roll the dice!')
      return
    }

    if (gameEngine.getRollsLeft() === 0) {
      toast.error('🚫 No rolls left! Choose a category to score.')
      return
    }

    setIsMoveInProgress(true)
    setIsRolling(true)

    const move: Move = {
      playerId: getCurrentUserId() || '',
      type: 'roll',
      data: {},
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

        const currentPlayer = newEngine.getCurrentPlayer()
        const rollNumber = 3 - newEngine.getRollsLeft()
        const newEntry: RollHistoryEntry = {
          id: `${Date.now()}_${Math.random()}`,
          turnNumber: Math.floor(newEngine.getRound() / (game?.players?.length || 1)) + 1,
          playerName: currentPlayer?.name || getCurrentUserName() || 'You',
          rollNumber: rollNumber,
          dice: newEngine.getDice(),
          held: newEngine.getHeld().map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1),
          timestamp: Date.now(),
          isBot: false,
        }
        setRollHistory(prev => [...prev.slice(-9), newEntry])

        const celebration = detectPatternOnRoll(newEngine.getDice())
        if (celebration) {
          setCelebrationEvent(celebration)
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
  }, [gameEngine, game, isMoveInProgress, isMyTurn, getCurrentUserId, isGuest, guestId, getCurrentUserName, code, setGameEngine, setRollHistory, setCelebrationEvent, emitWhenConnected])

  const handleToggleHold = useCallback(async (diceIndex: number) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return
    if (!isMyTurn()) {
      toast.error('🚫 It\'s not your turn!')
      return
    }

    try {
      const newHeld = [...gameEngine.getHeld()]
      newHeld[diceIndex] = !newHeld[diceIndex]

      const move: Move = {
        playerId: getCurrentUserId() || '',
        type: 'hold',
        data: { held: newHeld },
        timestamp: new Date(),
      }

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
        throw new Error(error.error || 'Failed to toggle hold')
      }

      const data = await res.json()
      const newEngine = new YahtzeeGame(gameEngine.getState().id)
      newEngine.restoreState(data.game.state)
      setGameEngine(newEngine)

      soundManager.play('click')

      emitWhenConnected('game-action', {
        lobbyCode: code,
        action: 'state-change',
        payload: {
          state: data.game.state,
        },
      })
    } catch (error: any) {
      toast.error('Failed to toggle hold')
      clientLogger.error('Failed to toggle hold:', error)
    }
  }, [gameEngine, game, isMyTurn, getCurrentUserId, isGuest, guestId, code, setGameEngine, emitWhenConnected])

  const handleScore = useCallback(async (category: YahtzeeCategory) => {
    if (!gameEngine || !(gameEngine instanceof YahtzeeGame) || !game) return

    if (isMoveInProgress) {
      clientLogger.log('Move already in progress, ignoring')
      return
    }

    if (!isMyTurn()) {
      toast.error('🚫 It\'s not your turn!')
      return
    }

    setIsMoveInProgress(true)
    setIsScoring(true)

    const move: Move = {
      playerId: getCurrentUserId() || '',
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
        if (nextPlayer) {
          soundManager.play('turnChange')
          toast(`${nextPlayer.name}'s turn!`, { icon: 'ℹ️' })
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to score')
    } finally {
      setIsMoveInProgress(false)
      setIsScoring(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, getCurrentUserId, isGuest, guestId, code, setGameEngine, emitWhenConnected, setTimerActive, fireworks])

  return {
    handleRollDice,
    handleToggleHold,
    handleScore,
    isMoveInProgress,
    isRolling,
    isScoring,
  }
}
