import { useState, useEffect, useRef } from 'react'
import { clientLogger } from '@/lib/client-logger'

interface UseGameTimerProps {
  isMyTurn: boolean
  gameState: any
  onTimeout: () => void
}

export function useGameTimer({ isMyTurn, gameState, onTimeout }: UseGameTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(60)
  const [timerActive, setTimerActive] = useState<boolean>(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [lastPlayerIndex, setLastPlayerIndex] = useState<number>(-1)
  
  // Use ref to avoid recreating timer on every onTimeout change
  const onTimeoutRef = useRef(onTimeout)
  const timeoutCalledRef = useRef(false)
  
  useEffect(() => {
    onTimeoutRef.current = onTimeout
  }, [onTimeout])

  // Track initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitialLoad(false)
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  // Timer logic
  useEffect(() => {
    if (!gameState) return

    const currentPlayerIndex = gameState.currentPlayerIndex

    // Detect if turn actually changed
    const turnChanged = currentPlayerIndex !== lastPlayerIndex
    if (turnChanged) {
      setLastPlayerIndex(currentPlayerIndex)
      // Reset timeout flag when turn changes
      timeoutCalledRef.current = false
    }

    if (isMyTurn) {
      setTimerActive(true)
      
      // Calculate remaining time from lastMoveAt if available
      const lastMoveAt = gameState.lastMoveAt
      if (lastMoveAt && typeof lastMoveAt === 'number') {
        const elapsedSeconds = Math.floor((Date.now() - lastMoveAt) / 1000)
        const remainingTime = Math.max(0, 60 - elapsedSeconds)
        
        if (isInitialLoad) {
          clientLogger.log('🔄 Initial load - my turn, calculated remaining time:', remainingTime, 's (elapsed:', elapsedSeconds, 's)')
          setTimeLeft(remainingTime)
          setIsInitialLoad(false)
        } else if (turnChanged) {
          clientLogger.log('🔄 Turn changed to me, calculated remaining time:', remainingTime, 's (elapsed:', elapsedSeconds, 's)')
          setTimeLeft(remainingTime)
        }
      } else {
        // Fallback to 60s if no lastMoveAt (shouldn't happen after migration)
        if (turnChanged) {
          if (isInitialLoad) {
            clientLogger.log('🔄 Initial load - my turn, starting timer at 60s (no lastMoveAt)')
            setTimeLeft(60)
            setIsInitialLoad(false)
          } else {
            clientLogger.log('🔄 Turn changed to me, resetting timer to 60s (no lastMoveAt)')
            setTimeLeft(60)
          }
        }
      }
    } else {
      setTimerActive(false)
      // Reset timeout flag when it's not my turn
      timeoutCalledRef.current = false
    }
  }, [gameState, isMyTurn, lastPlayerIndex, isInitialLoad])

  // Countdown
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      const interval = setInterval(() => {
        setTimeLeft(prev => prev <= 1 ? 0 : prev - 1)
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [timerActive, timeLeft])

  // Handle timeout separately in useEffect to avoid state updates during render
  useEffect(() => {
    if (timerActive && timeLeft === 0 && !timeoutCalledRef.current) {
      clientLogger.warn('⏰ Timer expired, calling onTimeout')
      timeoutCalledRef.current = true
      
      // Use setTimeout to defer the callback to next tick
      const timeoutId = setTimeout(() => {
        onTimeoutRef.current()
      }, 0)
      
      return () => clearTimeout(timeoutId)
    }
  }, [timerActive, timeLeft])

  return { timeLeft, timerActive }
}
