'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthHeaders } from '@/lib/auth-headers'
import { clientLogger } from '@/lib/client-logger'
import type { KickedPlayer } from '../components/WaitingRoomGuide'

interface UseKickedPlayersParams {
  code: string
  /** Host, in a lobby that has not started. Nobody else may read the list. */
  enabled: boolean
  isGuest: boolean
  guestId?: string | null
  guestName?: string | null
  guestToken?: string | null
}

/**
 * Who the host removed from this lobby (#899 / #1024).
 *
 * Kept out of `GET /api/lobby/[code]`: that response goes to every player,
 * spectator and guest on a poll, and who was removed is the host's business
 * alone. This asks the kick endpoint instead, which already gates on the host.
 *
 * There is no polling. The list only changes when this host kicks or unkicks,
 * so the two actions call `refresh` and nothing else has to.
 */
export function useKickedPlayers({
  code,
  enabled,
  isGuest,
  guestId,
  guestName,
  guestToken,
}: UseKickedPlayersParams) {
  const [kickedPlayers, setKickedPlayers] = useState<KickedPlayer[]>([])
  // A refresh fires right after a kick; the fetch it replaces must not win the race.
  const requestSeq = useRef(0)

  const refresh = useCallback(async () => {
    if (!enabled || !code) {
      setKickedPlayers([])
      return
    }

    const seq = ++requestSeq.current
    try {
      const res = await fetch(`/api/lobby/${code}/kick-player`, {
        headers: getAuthHeaders(isGuest, guestId, guestName, guestToken, { includeContentType: false }),
      })
      if (!res.ok) {
        // A 403 is the normal answer for anyone who stopped being the host.
        if (seq === requestSeq.current) setKickedPlayers([])
        return
      }
      const data = await res.json()
      if (seq === requestSeq.current) {
        setKickedPlayers(Array.isArray(data?.kickedPlayers) ? data.kickedPlayers : [])
      }
    } catch (err) {
      clientLogger.error('Failed to load the removed players:', err)
    }
  }, [code, enabled, isGuest, guestId, guestName, guestToken])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { kickedPlayers, refreshKickedPlayers: refresh }
}
