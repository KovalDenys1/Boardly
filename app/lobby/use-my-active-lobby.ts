'use client'

import { useState, useEffect, useCallback } from 'react'

export interface ActiveLobbyInfo {
  code: string
  name: string
  gameType: string
  playerCount: number
  maxPlayers: number
}

export function useMyActiveLobby(enabled: boolean) {
  const [data, setData] = useState<ActiveLobbyInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    fetch('/api/lobby/my-active', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (cancelled) return
        const lobby: ActiveLobbyInfo | null = json?.lobby ?? null
        if (lobby && sessionStorage.getItem(`dismissed-rejoin-${lobby.code}`) === '1') {
          setData(null)
        } else {
          setData(lobby)
        }
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [enabled])

  const dismiss = useCallback(() => {
    setData(prev => {
      if (prev?.code) sessionStorage.setItem(`dismissed-rejoin-${prev.code}`, '1')
      return null
    })
    setDismissed(true)
  }, [])

  return { lobby: dismissed ? null : data, loading, dismiss }
}
