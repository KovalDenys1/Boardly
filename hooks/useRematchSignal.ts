'use client'

import { useCallback, useEffect, useState } from 'react'
import { acquireLobbyChannel, type LobbyChannelHandle } from '@/lib/lobby-channel-registry'
import { fetchLobbyTopic } from '@/lib/lobby-realtime-topic-client'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

export type RematchAskState = 'idle' | 'sending' | 'sent'

function readRequesterName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const name = (payload as { requestedByName?: unknown }).requestedByName
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/**
 * The rematch ask between the players of a finished game, over the lobby's own channel so guests
 * hear it too: `ask` sends it, `requestedBy` is who asked.
 */
export function useRematchSignal(code: string | null | undefined) {
  const [requestedBy, setRequestedBy] = useState<string | null>(null)
  const [askState, setAskState] = useState<RematchAskState>('idle')

  useEffect(() => {
    if (!code) return
    let cancelled = false
    let handle: LobbyChannelHandle | null = null
    void fetchLobbyTopic(code, () => cancelled).then((topic) => {
      if (cancelled || !topic) return
      handle = acquireLobbyChannel(topic, {
        events: {
          'rematch-request': (payload) => {
            const name = readRequesterName(payload)
            if (name) setRequestedBy(name)
          },
        },
      })
    })
    return () => {
      cancelled = true
      handle?.release()
    }
  }, [code])

  const ask = useCallback(async () => {
    if (!code || askState !== 'idle') return
    setAskState('sending')
    try {
      const response = await fetchWithGuest(`/api/lobby/${code}/rematch`, { method: 'POST' })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        showToast.error(result?.translationKey || 'toast.rematchRequestFailed', undefined, undefined, { id: 'rematch-request' })
        setAskState('idle')
        return
      }
      setAskState('sent')
    } catch {
      showToast.error('toast.rematchRequestFailed', undefined, undefined, { id: 'rematch-request' })
      setAskState('idle')
    }
  }, [code, askState])

  return { requestedBy, askState, ask }
}
