import { useState, useEffect, useRef, useCallback } from 'react'
import { clientLogger } from '@/lib/client-logger'

interface GameState {
  currentPlayerIndex: number
  lastMoveAt?: number
  status?: string
}

interface UseGameTimerProps {
  isMyTurn: boolean
  gameState: GameState | null
  turnTimerLimit: number // Turn time limit from lobby settings (in seconds)
  // Return `false` to request retry (e.g. transient race while state is syncing).
  onTimeout: () => boolean | Promise<boolean>
}

export function useGameTimer({ isMyTurn, gameState, turnTimerLimit, onTimeout }: UseGameTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(turnTimerLimit)
  const [timerActive, setTimerActive] = useState<boolean>(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [timeoutRetryTick, setTimeoutRetryTick] = useState(0)
  
  // Use ref to avoid recreating timer on every onTimeout change
  const onTimeoutRef = useRef(onTimeout)
  const timeoutCalledRef = useRef(false)
  const timeoutInFlightRef = useRef(false)
  const timeoutRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnSignatureRef = useRef<string>('')
  const lastTimeoutInvocationAtRef = useRef<number>(0)
  const TIMEOUT_CALLBACK_DEBOUNCE_MS = 1500

  const clearTimeoutRetryTimer = useCallback(() => {
    if (timeoutRetryTimerRef.current) {
      clearTimeout(timeoutRetryTimerRef.current)
      timeoutRetryTimerRef.current = null
    }
  }, [])

  const scheduleTimeoutRetry = useCallback(() => {
    clearTimeoutRetryTimer()
    const elapsedSinceLastInvocation = Date.now() - lastTimeoutInvocationAtRef.current
    const retryDelayMs = Math.max(0, TIMEOUT_CALLBACK_DEBOUNCE_MS - elapsedSinceLastInvocation)

    timeoutRetryTimerRef.current = setTimeout(() => {
      timeoutRetryTimerRef.current = null
      setTimeoutRetryTick((prev) => prev + 1)
    }, retryDelayMs)
  }, [clearTimeoutRetryTimer])
  
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  // Track initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false)
    }, 1000)

    return () => {
      clearTimeout(timer)
      clearTimeoutRetryTimer()
    }
  }, [clearTimeoutRetryTimer])

  // Timer logic
  useEffect(() => {
    if (!gameState) return

    // Disable timer outside active gameplay
    if (gameState.status && gameState.status !== 'playing') {
      clearTimeoutRetryTimer()
      setTimerActive(false)
      return
    }

    const currentPlayerIndex = gameState.currentPlayerIndex
    const lastMoveAt =
      typeof gameState.lastMoveAt === 'number' && Number.isFinite(gameState.lastMoveAt)
        ? gameState.lastMoveAt
        : null
    const turnSignature = `${currentPlayerIndex}:${lastMoveAt ?? 'none'}`

    // Detect real turn boundary (player or turn-start timestamp changed)
    const turnChanged = turnSignatureRef.current !== turnSignature
    if (turnChanged) {
      turnSignatureRef.current = turnSignature
      // Reset timeout flag when turn changes
      timeoutCalledRef.current = false
      timeoutInFlightRef.current = false
      lastTimeoutInvocationAtRef.current = 0
      clearTimeoutRetryTimer()
      
      // Calculate remaining time from lastMoveAt if available
      if (lastMoveAt) {
        const elapsedSeconds = Math.floor((Date.now() - lastMoveAt) / 1000)
        const remainingTime = Math.max(0, turnTimerLimit - elapsedSeconds)
        
        if (isInitialLoad) {
          clientLogger.log('🔄 Initial load - turn changed, calculated remaining time:', remainingTime, 's (elapsed:', elapsedSeconds, 's, limit:', turnTimerLimit, 's)')
          setTimeLeft(remainingTime)
          setIsInitialLoad(false)
        } else {
          clientLogger.log('🔄 Turn changed (player index:', currentPlayerIndex, '), calculated remaining time:', remainingTime, 's (elapsed:', elapsedSeconds, 's, limit:', turnTimerLimit, 's)')
          setTimeLeft(remainingTime)
        }
      } else {
        // Fallback to turnTimerLimit if no lastMoveAt
        if (isInitialLoad) {
          clientLogger.log('🔄 Initial load - turn changed, starting timer at', turnTimerLimit, 's (no lastMoveAt)')
          setTimeLeft(turnTimerLimit)
          setIsInitialLoad(false)
        } else {
          clientLogger.log('🔄 Turn changed (player index:', currentPlayerIndex, '), resetting timer to', turnTimerLimit, 's (no lastMoveAt)')
          setTimeLeft(turnTimerLimit)
        }
      }
    }

    // Keep timer active for all turns to visualize countdown.
    // Timeout execution is additionally guarded by onTimeout callback conditions.
    setTimerActive(true)
  }, [gameState, isMyTurn, isInitialLoad, turnTimerLimit, clearTimeoutRetryTimer])

  // Countdown
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      const interval = setInterval(() => {
        setTimeLeft(prev => prev <= 1 ? 0 : prev - 1)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [timerActive, timeLeft])

  // Handle timeout separately in useEffect to avoid state updates during render.
  // If timeout handler returns `false`, we re-arm this effect and retry.
  useEffect(() => {
    if (timerActive && timeLeft === 0 && !timeoutCalledRef.current && gameState?.status === 'playing') {
      if (timeoutInFlightRef.current) {
        return
      }

      const now = Date.now()

      // Guard against stale zero state right after turn switch.
      // This can happen when effects run out of order on mobile/dev refresh cycles.
      const lastMoveAt =
        typeof gameState.lastMoveAt === 'number' && Number.isFinite(gameState.lastMoveAt)
          ? gameState.lastMoveAt
          : null
      if (lastMoveAt && turnTimerLimit > 0) {
        const elapsedMs = now - lastMoveAt
        const limitMs = turnTimerLimit * 1000
        if (elapsedMs < limitMs) {
          const remainingSeconds = Math.max(0, Math.ceil((limitMs - elapsedMs) / 1000))
          if (remainingSeconds > 0) {
            setTimeLeft(remainingSeconds)
          }
          return
        }
      }

      if (now - lastTimeoutInvocationAtRef.current < TIMEOUT_CALLBACK_DEBOUNCE_MS) {
        return
      }

      clientLogger.warn('⏰ Timer expired, calling onTimeout')
      lastTimeoutInvocationAtRef.current = now
      timeoutInFlightRef.current = true
      const invocationTurnSignature = turnSignatureRef.current
      
      // Use setTimeout to defer the callback to next tick
      const timeoutId = setTimeout(() => {
        Promise.resolve(onTimeoutRef.current())
          .then((handled) => {
            if (turnSignatureRef.current !== invocationTurnSignature) {
              return
            }
            if (handled === false) {
              timeoutCalledRef.current = false
              scheduleTimeoutRetry()
              return
            }
            timeoutCalledRef.current = true
          })
          .catch((error) => {
            if (turnSignatureRef.current !== invocationTurnSignature) {
              return
            }
            clientLogger.error('⏰ Timeout handler failed, scheduling retry', error)
            timeoutCalledRef.current = false
            scheduleTimeoutRetry()
          })
          .finally(() => {
            timeoutInFlightRef.current = false
          })
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [timerActive, timeLeft, gameState?.status, gameState?.lastMoveAt, turnTimerLimit, timeoutRetryTick, scheduleTimeoutRetry])

  return { timeLeft, timerActive }
}
