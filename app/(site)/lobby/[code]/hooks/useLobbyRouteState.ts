'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_GAME_TYPE } from '@/lib/game-catalog'
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

type LobbySnapshotRecord = Record<string, unknown>

interface UseLobbyRouteStateResult {
  gameType: string | null
  gameStatus: string | null
  /** The lobby as last read, for the closed-table decision (#1594); null until read or on failure. */
  lobby: LobbySnapshotRecord | null
  /** The lobby's most relevant game, finished ones included. */
  lastGame: LobbySnapshotRecord | null
  loading: boolean
  handleGameStarted: (startedGameType: string) => void
  handleGameReset: () => void
  /** Read the lobby again, e.g. after the table was reopened. */
  refresh: () => void
}

export function useLobbyRouteState({
  code,
  status,
  isGuest,
  guestToken,
}: UseLobbyRouteStateParams): UseLobbyRouteStateResult {
  const [gameType, setGameType] = useState<string | null>(null)
  const [gameStatus, setGameStatus] = useState<string | null>(null)
  const [lobby, setLobby] = useState<LobbySnapshotRecord | null>(null)
  const [lastGame, setLastGame] = useState<LobbySnapshotRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [readCount, setReadCount] = useState(0)

  useEffect(() => {
    if (status === 'loading') {
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
      setLobby(null)
      setLastGame(null)
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
          setLobby(lobbyData)
          setLastGame(activeGame)
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
  }, [code, status, isGuest, guestToken, readCount])

  // A live transition outdates the read; only a fresh read may decide that the table is closed.
  const forgetRead = useCallback(() => {
    setLobby(null)
    setLastGame(null)
  }, [])

  const handleGameStarted = useCallback((startedGameType: string) => {
    setGameType(startedGameType)
    setGameStatus('playing')
    forgetRead()
  }, [forgetRead])

  const handleGameReset = useCallback(() => {
    setGameStatus(null)
    forgetRead()
  }, [forgetRead])

  const refresh = useCallback(() => {
    setReadCount((count) => count + 1)
  }, [])

  return {
    gameType,
    gameStatus,
    lobby,
    lastGame,
    loading,
    handleGameStarted,
    handleGameReset,
    refresh,
  }
}
