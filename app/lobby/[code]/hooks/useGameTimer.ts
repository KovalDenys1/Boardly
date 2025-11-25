import { useState, useEffect, useCallback, useRef } from 'react'
import { clientLogger } from '@/lib/client-logger'

interface UseGameTimerProps {
  isMyTurn: () => boolean
  gameState: any
  onTimeout: () => void
}

export function useGameTimer({ isMyTurn, gameState, onTimeout }: UseGameTimerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(60)
  const [timerActive, setTimerActive] = useState<boolean>(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [lastPlayerIndex, setLastPlayerIndex] = useState<number>(-1)

  const handleTimeOut = useCallback(() => {
    if (timerActive) {
      onTimeout()
    }
  }, [timerActive, onTimeout])

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

    const myTurn = isMyTurn()
    const currentPlayerIndex = gameState.currentPlayerIndex

    // Detect if turn actually changed
    const turnChanged = currentPlayerIndex !== lastPlayerIndex
    if (turnChanged) {
      setLastPlayerIndex(currentPlayerIndex)
    }

    if (myTurn) {
      setTimerActive(true)
      
      // Only reset timer if turn changed
      if (turnChanged) {
        if (isInitialLoad) {
          clientLogger.log('🔄 Initial load - my turn, starting timer at 60s')
          setTimeLeft(60)
          setIsInitialLoad(false)
        } else {
          clientLogger.log('🔄 Turn changed to me, resetting timer to 60s')
          setTimeLeft(60)
        }
      }
    } else {
      setTimerActive(false)
    }
  }, [gameState, isMyTurn, lastPlayerIndex, isInitialLoad])

  // Countdown
  useEffect(() => {
    if (timerActive && timeLeft > 0) {
      const interval = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clientLogger.warn('⏰ Timer expired, calling handleTimeOut')
            handleTimeOut()
            return 0
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [timerActive, timeLeft, handleTimeOut])

  return { timeLeft, timerActive }
}
