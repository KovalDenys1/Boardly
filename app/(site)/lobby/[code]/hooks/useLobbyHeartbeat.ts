'use client'

import { useEffect } from 'react'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'

const HEARTBEAT_INTERVAL_MS = 10_000

/**
 * Pings POST /api/lobby/[code]/heartbeat every ~10s while mounted — the
 * only real signal the server has for zero-signal disconnect detection
 * (#675). There's no beforeunload-reliable way to catch a closed tab from
 * the client, so this and the server-side staleness sweep
 * (lib/lobby-presence.ts) are the whole mechanism: stop pinging = stale
 * heartbeat = swept by whoever's request loads the lobby next.
 *
 * Deliberately keeps pinging on a backgrounded/hidden tab — a player who
 * alt-tabbed is still connected, not disconnected, and gating this on
 * document.visibilityState would make legitimately-open-but-backgrounded
 * tabs look abandoned.
 */
export function useLobbyHeartbeat(code: string | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!code || !enabled) return

    let cancelled = false
    const ping = () => {
      void fetchWithGuest(`/api/lobby/${code}/heartbeat`, { method: 'POST' }).catch((error) => {
        if (!cancelled) {
          clientLogger.debug('Lobby heartbeat ping failed (will retry next interval)', { code, error })
        }
      })
    }

    ping()
    const intervalId = window.setInterval(ping, HEARTBEAT_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [code, enabled])
}
