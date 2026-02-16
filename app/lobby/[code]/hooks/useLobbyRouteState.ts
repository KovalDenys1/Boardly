'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_GAME_TYPE } from '@/lib/game-registry'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { normalizeLobbySnapshotResponse } from '@/lib/lobby-snapshot'
import { clientLogger } from '@/lib/client-logger'

type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface UseLobbyRouteStateParams {
  code: string
  status: SessionStatus
  isGuest: boolean
  guestToken: string | null
}

interface UseLobbyRouteStateResult {
  gameType: string | null
  gameStatus: string | null
  loading: boolean
  handleGameStarted: (startedGameType: string) => void
}

export function useLobbyRouteState({
  code,
  status,
  isGuest,
  guestToken,
}: UseLobbyRouteStateParams): UseLobbyRouteStateResult {
  const [gameType, setGameType] = useState<string | null>(null)
  const [gameStatus, setGameStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) {
      return
    }

    if (isGuest && !guestToken) {
      return
    }

    let cancelled = false

    const setFallbackState = () => {
      if (cancelled) {
        return
      }
      setGameType(DEFAULT_GAME_TYPE)
      setGameStatus(null)
    }

    ;(async () => {
      try {
        const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })

        if (cancelled) {
          return
        }

        if (res.ok) {
          const data = await res.json()
          const { lobby: lobbyData, activeGame } = normalizeLobbySnapshotResponse(data)
          setGameType(lobbyData?.gameType || DEFAULT_GAME_TYPE)
          setGameStatus(activeGame?.status || null)
          return
        }

        setFallbackState()
      } catch (error) {
        clientLogger.log('Error detecting game type:', error)
        setFallbackState()
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code, status, isGuest, guestToken])

  const handleGameStarted = useCallback((startedGameType: string) => {
    setGameType(startedGameType)
    setGameStatus('playing')
  }, [])

  return {
    gameType,
    gameStatus,
    loading,
    handleGameStarted,
  }
}
