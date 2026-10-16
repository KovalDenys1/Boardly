'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { acquireLobbyChannel } from '@/lib/lobby-channel-registry'
import { fetchLobbyTopic } from '@/lib/lobby-realtime-topic-client'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { showToast } from '@/lib/i18n-toast'

export type RematchAskState = 'idle' | 'sending' | 'sent'

interface RematchSnapshot {
  requestedBy: string | null
  askState: RematchAskState
}

interface RematchEntry {
  /** The finish this state belongs to; a new one starts from scratch. */
  finishKey: string | null
  snap: RematchSnapshot
  listeners: Set<() => void>
  subscribed: boolean
}

// Per lobby, not per overlay: the overlay unmounts on View board, and the host must still hear an ask
// that arrives meanwhile, and a guest must not get the button back after asking.
const lobbies = new Map<string, RematchEntry>()
const IDLE: RematchSnapshot = { requestedBy: null, askState: 'idle' }

function entryFor(code: string): RematchEntry {
  let entry = lobbies.get(code)
  if (!entry) {
    entry = { finishKey: null, snap: IDLE, listeners: new Set(), subscribed: false }
    lobbies.set(code, entry)
  }
  return entry
}

function update(code: string, patch: Partial<RematchSnapshot>) {
  const entry = entryFor(code)
  entry.snap = { ...entry.snap, ...patch }
  entry.listeners.forEach((listener) => listener())
}

function readRequesterName(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const name = (payload as { requestedByName?: unknown }).requestedByName
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

function subscribeOnce(code: string) {
  const entry = entryFor(code)
  if (entry.subscribed) return
  entry.subscribed = true
  void fetchLobbyTopic(code).then((topic) => {
    if (!topic) {
      entry.subscribed = false
      return
    }
    acquireLobbyChannel(topic, {
      events: {
        'rematch-request': (payload) => {
          const name = readRequesterName(payload)
          if (name) update(code, { requestedBy: name })
        },
      },
    })
  })
}

/** Clears every lobby's state; for tests. */
export function resetRematchSignals(): void {
  lobbies.clear()
}

/**
 * The rematch ask between the players of a finished game, over the lobby's own channel so a guest
 * host hears it too. `finishKey` names the finish (the game id or the overlay's result key).
 */
export function useRematchSignal(code: string | null | undefined, finishKey: string | null) {
  useEffect(() => {
    if (!code) return
    const entry = entryFor(code)
    if (entry.finishKey !== finishKey) {
      entry.finishKey = finishKey
      update(code, { requestedBy: null, askState: 'idle' })
    }
    subscribeOnce(code)
  }, [code, finishKey])

  const subscribe = useCallback((listener: () => void) => {
    if (!code) return () => {}
    const entry = entryFor(code)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }, [code])
  const snapshot = useCallback(() => {
    if (!code) return IDLE
    const entry = entryFor(code)
    return entry.finishKey === finishKey ? entry.snap : IDLE
  }, [code, finishKey])
  const state = useSyncExternalStore(subscribe, snapshot, () => IDLE)

  const ask = useCallback(async () => {
    if (!code || entryFor(code).snap.askState !== 'idle') return
    update(code, { askState: 'sending' })
    try {
      const response = await fetchWithGuest(`/api/lobby/${code}/rematch`, { method: 'POST' })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        showToast.error(result?.translationKey || 'toast.rematchRequestFailed', undefined, undefined, { id: 'rematch-request' })
        update(code, { askState: 'idle' })
        return
      }
      if (result?.notifiedCount === 0) {
        showToast.info('toast.rematchNoPlayers', undefined, undefined, { id: 'rematch-request' })
        update(code, { askState: 'idle' })
        return
      }
      update(code, { askState: 'sent' })
    } catch {
      showToast.error('toast.rematchRequestFailed', undefined, undefined, { id: 'rematch-request' })
      update(code, { askState: 'idle' })
    }
  }, [code])

  return { requestedBy: state.requestedBy, askState: state.askState, ask }
}
