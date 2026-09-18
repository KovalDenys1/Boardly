import { createElement, useState, useCallback, useEffect, useRef } from 'react'
import { Icon } from '@/components/icons'
import { YahtzeeGame } from '@/lib/games/yahtzee-game'
import { GameEngine, Move } from '@/lib/game-engine'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import { YahtzeeCategory, calculateScore } from '@/lib/yahtzee'
import { sounds } from '@/lib/sounds'
import { clientLogger } from '@/lib/client-logger'
import { getAuthHeaders } from '@/lib/auth-headers'
import { showToast } from '@/lib/i18n-toast'
import { showYahtzeeCategoryToast } from '@/lib/yahtzee-notifications'
import { RollHistoryEntry } from '@/components/RollHistory'
import { detectPatternOnRoll, detectCelebration, CelebrationEvent } from '@/lib/celebrations'
import { Game, GamePlayer } from '@/types/game'
import { trackPlayerAction, trackGameCompleted, trackMoveSubmitApplied } from '@/lib/analytics'
import { decideFreshness, type FreshnessWatermark } from '@/lib/game-state-freshness'

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
  code: string
  setRollHistory: React.Dispatch<React.SetStateAction<RollHistoryEntry[]>>
  setCelebrationEvent: React.Dispatch<React.SetStateAction<CelebrationEvent | null>>
  setTimerActive: (active: boolean) => void
  celebrate: () => void
  fireworks: () => void
  reconcileWithServerSnapshot: () => Promise<void>
  /** Shared watermark (#985): the response to a move here is the newest state that exists, so it moves the watermark for everyone reading it. */
  freshnessRef: React.MutableRefObject<FreshnessWatermark>
  /** Mirrors `isMoveInProgress` for readers that run outside React's render cycle - the broadcast handler needs it synchronously (#994). */
  moveInFlightRef: React.MutableRefObject<boolean>
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

/**
 * The move response carries the authoritative state already parsed, while a
 * broadcast and the lobby snapshot carry it as a JSON string. JSON.parse on an
 * object throws, so neither shape can be assumed.
 */
function parseServerGameState(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isExpectedAutoActionSkip(status: number, error: unknown): boolean {
  if (status === 202) return true
  if (status === 409) return true

  const code = typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>).code
    : undefined
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
    code,
    setRollHistory,
    setCelebrationEvent,
    setTimerActive,
    celebrate,
    fireworks,
    reconcileWithServerSnapshot,
    freshnessRef,
    moveInFlightRef,
  } = props

  const [isMoveInProgress, setIsMoveInProgressState] = useState(false)
  const [isRolling, setIsRolling] = useState(false)
  const [isScoring, setIsScoring] = useState(false)
  const [isStateReverting, setIsStateReverting] = useState(false)
  const rollbackIndicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevIsMyTurnRef = useRef(false)

  // Local held state - purely client-side between rolls
  const [held, setHeld] = useState<boolean[]>([false, false, false, false, false])

  // A React state update is not visible to the broadcast handler until the next
  // render, and a broadcast can land in between; the ref is what that handler reads.
  const setIsMoveInProgress = useCallback((inProgress: boolean) => {
    moveInFlightRef.current = inProgress
    setIsMoveInProgressState(inProgress)
  }, [moveInFlightRef])

  // Safety reset: when the turn flips to ours, clear any leftover in-progress flags.
  // This handles the case where isMoveInProgress got stuck during a disconnect/turn advance.
  useEffect(() => {
    if (isMyTurn && !prevIsMyTurnRef.current) {
      setIsMoveInProgress(false)
      setIsRolling(false)
      setIsScoring(false)
    }
    prevIsMyTurnRef.current = isMyTurn
  }, [isMyTurn, setIsMoveInProgress])

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

    if (isMoveInProgress && !isAutoAction) {
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

    if (preMoveHeld.every(Boolean)) {
      if (!isAutoAction) {
        showToast.error('toast.allDiceHeld')
      }
      return null
    }

    setIsMoveInProgress(true)
    setIsRolling(true)

    // Play sound immediately for instant feedback (force to ensure it plays)
    sounds.play('diceRoll', { force: true })

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
    const submitStartedAt = Date.now()
    let responseStatus: number | undefined
    let moveMetricTracked = false

    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)

      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move, autoActionContext: normalizedAutoActionContext }),
      })
      responseStatus = res.status

      // Auto-actions can be debounced/ignored server-side by design.
      if (isAutoAction && res.status === 202) {
        trackMoveSubmitApplied({
          gameType: 'yahtzee',
          moveType: 'roll',
          durationMs: Date.now() - submitStartedAt,
          isGuest,
          success: true,
          applied: false,
          statusCode: responseStatus,
          isAutoAction,
          source: 'yahtzee_hook',
        })
        moveMetricTracked = true
        return null
      }

      if (!res.ok) {
        const error = await res.json()
        if (isAutoAction && isExpectedAutoActionSkip(res.status, error)) {
          trackMoveSubmitApplied({
            gameType: 'yahtzee',
            moveType: 'roll',
            durationMs: Date.now() - submitStartedAt,
            isGuest,
            success: true,
            applied: false,
            statusCode: responseStatus,
            isAutoAction,
            source: 'yahtzee_hook',
          })
          moveMetricTracked = true
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
      // The answer to the move this client just made is the newest state that
      // exists, so it moves the watermark every other source is judged against
      // (#985) - including the broadcast of the *previous* move, which routinely
      // lands after this response and used to rewind the board (#994).
      const parsedServerState = parseServerGameState(data.game.state)
      decideFreshness(freshnessRef.current, parsedServerState, { trusted: true })

      // Replace optimistic update with real server data
      let newEngine: YahtzeeGame | null = null
      if (gameEngine) {
        newEngine = await restoreGameEngineClient('yahtzee', gameEngine.getState().id, data.game.state) as YahtzeeGame
        setGameEngine(newEngine)

        // Update local held state from server (source of truth)
        setHeld(newEngine.getHeld())

        const currentPlayer = newEngine.getCurrentPlayer()
        const rollNumber = 3 - newEngine.getRollsLeft()
        // The roll id has to match the one LobbyPageClient's broadcast handler
        // builds, or the same roll shows up twice in the history. That match is
        // on the server timestamp, which is why the state above is parsed
        // through a helper that tolerates both shapes rather than a bare
        // JSON.parse - which throws on an object and used to fall back to a
        // random id here.
        const serverTs = (parsedServerState as { data?: { lastRoll?: { timestamp?: string } } } | null)?.data?.lastRoll?.timestamp
        const newEntry: RollHistoryEntry = {
          id: serverTs ? `${userId || guestId}-${serverTs}` : `${Date.now()}_${Math.random()}`,
          turnNumber: newEngine.getRound(),
          playerName: currentPlayer?.name || username || 'You',
          rollNumber: rollNumber,
          dice: newEngine.getDice(),
          held: newEngine.getHeld().map((isHeld, idx) => isHeld ? idx : -1).filter(idx => idx !== -1),
          timestamp: Date.now(),
          isBot: false,
        }
        setRollHistory(prev => {
          if (prev.some(e => e.id === newEntry.id)) return prev
          return [...prev.slice(-19), newEntry]
        })

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

      // No snapshot fetch here (#861). `data.game.state` is the authoritative
      // state and it is already applied above, so `GET /api/lobby/:code` would
      // answer with what this client just installed.
      //
      // This is not the broadcast being trusted, which is what #859 was about:
      // nothing here waits on a delivery, the state arrived on this move's own
      // response. What the snapshot also refreshes is the lobby and the player
      // rows, and a roll changes neither — the scores on screen are read off
      // the engine, not off `game.players`, and `Games.status` still says
      // playing.

      trackMoveSubmitApplied({
        gameType: 'yahtzee',
        moveType: 'roll',
        durationMs: Date.now() - submitStartedAt,
        isGuest,
        success: true,
        applied: true,
        statusCode: responseStatus,
        isAutoAction,
        source: 'yahtzee_hook',
      })
      moveMetricTracked = true

      return newEngine
    } catch (error: unknown) {
      if (!moveMetricTracked) {
        trackMoveSubmitApplied({
          gameType: 'yahtzee',
          moveType: 'roll',
          durationMs: Date.now() - submitStartedAt,
          isGuest,
          success: false,
          applied: false,
          statusCode: responseStatus,
          isAutoAction,
          source: 'yahtzee_hook',
        })
      }
      if (!isAutoAction) {
        setHeld(preMoveHeld)
        await reconcileAfterMoveError()
        showToast.errorFrom(error, 'toast.rollFailed')
      } else {
        clientLogger.log('⏱️ Auto roll failed or skipped', { message: error instanceof Error ? error.message : undefined })
      }
      return null
    } finally {
      setIsMoveInProgress(false)
      setIsRolling(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, guestName, guestToken, username, code, held, setGameEngine, setRollHistory, setCelebrationEvent, celebrate, reconcileAfterMoveError, freshnessRef, setIsMoveInProgress])

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

    if (isMoveInProgress && !isAutoAction) {
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

    const diceBeforeScore = gameEngine.getDice()
    const availableCategoryScores = scorecard
      ? Object.entries(scorecard)
          .filter(([, value]) => value === undefined)
          .map(([candidate]) => calculateScore(diceBeforeScore, candidate as YahtzeeCategory))
      : []
    const bestAvailableScore = availableCategoryScores.length > 0 ? Math.max(...availableCategoryScores) : 0

    const move: Move = {
      playerId: userId || '',
      type: 'score',
      data: { category },
      timestamp: new Date(),
    }
    const shouldApplyOptimisticScore = !isAutoAction
    const previousEngine = gameEngine
    const submitStartedAt = Date.now()
    let responseStatus: number | undefined
    let moveMetricTracked = false

    if (shouldApplyOptimisticScore) {
      try {
        const optimisticEngine = new YahtzeeGame(game.id)
        optimisticEngine.restoreState(gameEngine.getState())
        const optimisticApplied = optimisticEngine.makeMove(move)

        if (!optimisticApplied) {
          setIsMoveInProgress(false)
          setIsScoring(false)
          showToast.error('toast.scoreFailed')
          return null
        }

        // Apply optimistic turn + score update for instant feedback.
        setGameEngine(optimisticEngine)
        setHeld([false, false, false, false, false])
        sounds.play('score', { force: true })
      } catch (optimisticError) {
        clientLogger.warn('Failed to apply optimistic score update', optimisticError)
      }
    }

    try {
      const headers = getAuthHeaders(isGuest, guestId, guestName, guestToken)

      const res = await fetch(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ move, autoActionContext: normalizedAutoActionContext }),
      })
      responseStatus = res.status

      // Auto-actions can be debounced/ignored server-side by design.
      if (isAutoAction && res.status === 202) {
        trackMoveSubmitApplied({
          gameType: 'yahtzee',
          moveType: 'score',
          durationMs: Date.now() - submitStartedAt,
          isGuest,
          success: true,
          applied: false,
          statusCode: responseStatus,
          isAutoAction,
          source: 'yahtzee_hook',
        })
        moveMetricTracked = true
        return null
      }

      if (!res.ok) {
        const error = await res.json()
        if (isAutoAction && isExpectedAutoActionSkip(res.status, error)) {
          trackMoveSubmitApplied({
            gameType: 'yahtzee',
            moveType: 'score',
            durationMs: Date.now() - submitStartedAt,
            isGuest,
            success: true,
            applied: false,
            statusCode: responseStatus,
            isAutoAction,
            source: 'yahtzee_hook',
          })
          moveMetricTracked = true
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
      // Trusted for the reason the roll path gives: this is the server's answer
      // to the move it just applied (#985).
      decideFreshness(freshnessRef.current, parseServerGameState(data.game.state), { trusted: true })
      const newEngine = await restoreGameEngineClient('yahtzee', gameEngine.getState().id, data.game.state) as YahtzeeGame
      setGameEngine(newEngine)

      // Reset local held state for next turn
      setHeld([false, false, false, false, false])

      // Calculate score for celebration detection
      const scoredValue = calculateScore(diceBeforeScore, category)
      const isBestPick = scoredValue > 0 && scoredValue === bestAvailableScore

      // Get the NEW scorecard (after scoring) to verify category is now filled
      const newScorecard = newEngine.getScorecard(userId || '')

      // Check if this score deserves a celebration
      // Only celebrate if we just filled this category (it should now be defined in scorecard)
      if (newScorecard && newScorecard[category] !== undefined) {
        const celebration = detectCelebration(diceBeforeScore, category, scoredValue)
        if (celebration) {
          setCelebrationEvent(celebration)
          celebrate() // Trigger confetti for good scores
        } else {
          showYahtzeeCategoryToast({
            category,
            score: scoredValue,
            isBestPick,
            id: `yahtzee-score-${category}-${scoredValue}-${newEngine.getRound()}`,
          })
        }
      }

      if (isAutoAction) {
        sounds.play('score', { force: true })
      }

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

      // No snapshot fetch on an ordinary score, for the reason the roll path
      // above gives (#861): the authoritative state came back on this response
      // and is already applied.
      //
      // The move that ends the game is the exception. It is the one move that
      // changes something the response does not carry — `Games.status` becomes
      // 'finished' server-side, and the end-of-game view is keyed on it. Once
      // per game rather than once per move.
      if (newEngine.isGameFinished()) {
        void reconcileWithServerSnapshot()
      }

      trackMoveSubmitApplied({
        gameType: 'yahtzee',
        moveType: 'score',
        durationMs: Date.now() - submitStartedAt,
        isGuest,
        success: true,
        applied: true,
        statusCode: responseStatus,
        isAutoAction,
        source: 'yahtzee_hook',
      })
      moveMetricTracked = true

      if (newEngine.isGameFinished()) {
        setTimerActive(false)
        const winner = newEngine.checkWinCondition()

        // Track game completion
        const startTime = game.createdAt ? new Date(game.createdAt).getTime() : Date.now()
        const endTime = Date.now()
        const durationMinutes = Math.round((endTime - startTime) / 60000)

        // Safety check: ensure game.players exists and is an array
        const winnerPlayer = winner?.id && Array.isArray(game.players)
          ? game.players.find((p: GamePlayer) => p.userId === winner.id)
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
          if (winner.id === userId) sounds.play('win')
          showToast.success('toast.gameOver', undefined, { player: winner.name })
        }
      } else {
        const nextPlayer = newEngine.getCurrentPlayer()

        // Only show "next turn" toast if it's NOT our turn now
        // (don't show to the player who just scored)
        if (nextPlayer && nextPlayer.id !== userId) {
          showToast.custom('toast.playerTurn', createElement(Icon, { name: 'info', size: 18 }), undefined, { player: nextPlayer.name })
        }
      }

      return newEngine
    } catch (error: unknown) {
      if (!moveMetricTracked) {
        trackMoveSubmitApplied({
          gameType: 'yahtzee',
          moveType: 'score',
          durationMs: Date.now() - submitStartedAt,
          isGuest,
          success: false,
          applied: false,
          statusCode: responseStatus,
          isAutoAction,
          source: 'yahtzee_hook',
        })
      }
      if (!isAutoAction) {
        if (shouldApplyOptimisticScore) {
          setGameEngine(previousEngine)
        }
        setHeld(preMoveHeld)
        await reconcileAfterMoveError()
        showToast.errorFrom(error, 'toast.scoreFailed')
      } else {
        clientLogger.log('⏱️ Auto score failed or skipped', { message: error instanceof Error ? error.message : undefined })
      }
      return null
    } finally {
      setIsMoveInProgress(false)
      setIsScoring(false)
    }
  }, [gameEngine, game, isMoveInProgress, isMyTurn, userId, isGuest, guestId, guestName, guestToken, code, setGameEngine, setCelebrationEvent, celebrate, setTimerActive, fireworks, reconcileWithServerSnapshot, reconcileAfterMoveError, freshnessRef, setIsMoveInProgress])

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
