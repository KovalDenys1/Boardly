'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'
import { BLOCKED_PLAYERS_CHANGED_EVENT, BLOCKED_PLAYERS_STORAGE_KEY } from '@/lib/user-blocks'

export type BlockedPlayer = { id: string; username: string; blockedAt: string }

export type UseBlockedPlayers = {
  /** Newest block first. Empty until `ready`. */
  blocked: BlockedPlayer[]
  blockedIds: ReadonlySet<string>
  /** False while the session is loading, and for a signed-in user until the account list has answered. */
  ready: boolean
  /** Resolves true once the block is kept; false when it could not be, with nothing changed (session loading, account list not loaded, the server refused, or the device would not store it). */
  block: (player: { id: string; username: string }) => Promise<boolean>
  /** Resolves true once the player is unblocked; false when it could not be, with nothing changed (same reasons as `block`). */
  unblock: (id: string) => Promise<boolean>
}

const DEVICE_LIMIT = 200
const BLOCKS_URL = '/api/user/blocks'

type Mode = 'pending' | 'account' | 'device'
type Snapshot = { mode: Mode; players: BlockedPlayer[] }
/** The changed event's detail from an instance; other senders (GuestContext) send none. */
type Change = { source: object; mode: Mode; selfId: string | undefined; players: BlockedPlayer[] }

const NO_PLAYERS: BlockedPlayer[] = []

function parsePlayers(value: unknown): BlockedPlayer[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const players: BlockedPlayer[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const { id, username, blockedAt } = entry as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || typeof username !== 'string' || typeof blockedAt !== 'string') continue
    if (seen.has(id)) continue
    seen.add(id)
    players.push({ id, username, blockedAt })
  }
  return players
}

/** Oldest first, the order they are stored in. */
function readDevice(): BlockedPlayer[] {
  const raw = readLocal(BLOCKED_PLAYERS_STORAGE_KEY)
  if (!raw) return []
  try {
    return parsePlayers(JSON.parse(raw)).slice(-DEVICE_LIMIT)
  } catch {
    return []
  }
}

function writeDevice(players: BlockedPlayer[]) {
  if (players.length === 0) removeLocal(BLOCKED_PLAYERS_STORAGE_KEY)
  else writeLocal(BLOCKED_PLAYERS_STORAGE_KEY, JSON.stringify(players))
}

function newestFirst(players: BlockedPlayer[]): BlockedPlayer[] {
  return [...players].reverse()
}

function insertByRecency(players: BlockedPlayer[], entry: BlockedPlayer): BlockedPlayer[] {
  const at = players.findIndex((existing) => existing.blockedAt < entry.blockedAt)
  return at === -1 ? [...players, entry] : [...players.slice(0, at), entry, ...players.slice(at)]
}

async function fetchAccountPlayers(): Promise<BlockedPlayer[] | null> {
  try {
    const response = await fetch(BLOCKS_URL)
    if (!response.ok) return null
    const body: unknown = await response.json()
    return parsePlayers((body as { blocks?: unknown } | null)?.blocks)
  } catch {
    return null
  }
}

// Shared by every instance on the page, so the chats and cards that mount together send one GET.
let accountReadInFlight: { selfId: string | undefined; request: Promise<BlockedPlayer[] | null> } | null = null

function readAccountPlayers(selfId: string | undefined): Promise<BlockedPlayer[] | null> {
  if (accountReadInFlight && accountReadInFlight.selfId === selfId) return accountReadInFlight.request
  const request = fetchAccountPlayers().finally(() => {
    if (accountReadInFlight?.request === request) accountReadInFlight = null
  })
  accountReadInFlight = { selfId, request }
  return request
}

// Shared by every instance on the page, so several chats and React's double effect send one request.
let handOverInFlight: Promise<void> | null = null

function handOverDeviceList(selfId: string | undefined): Promise<void> {
  if (handOverInFlight) return handOverInFlight
  const userIds = readDevice()
    .map((player) => player.id)
    .filter((id) => id !== selfId)
  if (userIds.length === 0) {
    removeLocal(BLOCKED_PLAYERS_STORAGE_KEY)
    return Promise.resolve()
  }

  const run = (async () => {
    try {
      const response = await fetch(BLOCKS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      })
      // A 400 will be a 400 on every retry (account at its limit, ids the route rejects); anything else may pass later.
      if (response.ok || response.status === 400) removeLocal(BLOCKED_PLAYERS_STORAGE_KEY)
    } catch {
      // The list stays on the device and goes with the next load.
    }
  })().finally(() => {
    handOverInFlight = null
  })
  handOverInFlight = run
  return run
}

/**
 * The viewer's own block list, one API for guests and accounts (#1466).
 *
 * Signed in, it lives on the account behind /api/user/blocks. As a guest or signed
 * out it lives on this device, and the first load after sign-in moves it to the account.
 */
export function useBlockedPlayers(): UseBlockedPlayers {
  const { data: session, status } = useSession()
  const selfId = session?.user?.id
  const mode: Mode = status === 'loading' ? 'pending' : status === 'authenticated' ? 'account' : 'device'

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const current = snapshot?.mode === mode ? snapshot.players : null
  const ready = current !== null
  const blocked = current ?? NO_PLAYERS
  const blockedIds = useMemo<ReadonlySet<string>>(() => new Set(blocked.map((player) => player.id)), [blocked])

  const latest = useRef({ ready, blocked })
  useEffect(() => {
    latest.current = { ready, blocked }
  }, [ready, blocked])

  const loadTicket = useRef(0)
  const source = useRef({})

  const load = useCallback(async () => {
    if (mode === 'pending') return
    const ticket = ++loadTicket.current
    if (mode === 'device') {
      setSnapshot({ mode, players: newestFirst(readDevice()) })
      return
    }
    const players = await readAccountPlayers(selfId)
    if (ticket !== loadTicket.current) return
    // A failed read leaves what is shown and ends the wait: chat must not hang on a list it cannot get.
    setSnapshot((previous) => (players ? { mode, players } : previous?.mode === mode ? previous : { mode, players: [] }))
  }, [mode, selfId])

  useEffect(() => {
    if (mode === 'pending') return
    let cancelled = false
    void (async () => {
      if (mode === 'account') await handOverDeviceList(selfId)
      if (!cancelled) await load()
    })()
    return () => {
      cancelled = true
    }
  }, [mode, load, selfId])

  useEffect(() => {
    if (mode === 'pending') return
    const onChanged = (event: Event) => {
      const change = (event as CustomEvent<Change | undefined>).detail
      if (change?.source === source.current) return
      if (mode === 'account' && change?.mode === 'account' && change.selfId === selfId) {
        loadTicket.current++
        setSnapshot({ mode, players: change.players })
        return
      }
      void load()
    }
    window.addEventListener(BLOCKED_PLAYERS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(BLOCKED_PLAYERS_CHANGED_EVENT, onChanged)
  }, [mode, load, selfId])

  useEffect(() => {
    if (mode !== 'device') return
    const onStorage = (event: StorageEvent) => {
      if (event.key === BLOCKED_PLAYERS_STORAGE_KEY || event.key === null) void load()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [mode, load])

  const announce = useCallback(
    (players: BlockedPlayer[]) => {
      const change: Change = { source: source.current, mode, selfId, players }
      window.dispatchEvent(new CustomEvent<Change>(BLOCKED_PLAYERS_CHANGED_EVENT, { detail: change }))
    },
    [mode, selfId]
  )

  const edit = useCallback(
    (change: (players: BlockedPlayer[]) => BlockedPlayer[]) => {
      setSnapshot((previous) => (previous?.mode === mode ? { mode, players: change(previous.players) } : previous))
    },
    [mode]
  )

  const block = useCallback(
    async (player: { id: string; username: string }): Promise<boolean> => {
      if (mode === 'pending') return false
      const entry: BlockedPlayer = { id: player.id, username: player.username, blockedAt: new Date().toISOString() }

      if (mode === 'device') {
        const stored = readDevice()
        if (!stored.some((existing) => existing.id === player.id)) writeDevice([...stored, entry].slice(-DEVICE_LIMIT))
        const kept = readDevice()
        setSnapshot({ mode, players: newestFirst(kept) })
        announce(newestFirst(kept))
        return kept.some((existing) => existing.id === player.id)
      }

      if (!latest.current.ready) return false
      if (latest.current.blocked.some((existing) => existing.id === player.id)) return true

      edit((players) => [entry, ...players])
      try {
        const response = await fetch(BLOCKS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: [player.id] }),
        })
        if (!response.ok) throw new Error(`block failed: ${response.status}`)
      } catch {
        edit((players) => players.filter((existing) => existing.id !== player.id))
        return false
      }
      const current = latest.current.blocked
      announce(current.some((existing) => existing.id === player.id) ? current : [entry, ...current])
      return true
    },
    [mode, edit, announce]
  )

  const unblock = useCallback(
    async (id: string): Promise<boolean> => {
      if (mode === 'pending') return false

      if (mode === 'device') {
        writeDevice(readDevice().filter((existing) => existing.id !== id))
        const kept = readDevice()
        setSnapshot({ mode, players: newestFirst(kept) })
        announce(newestFirst(kept))
        return !kept.some((existing) => existing.id === id)
      }

      if (!latest.current.ready) return false
      const removed = latest.current.blocked.find((existing) => existing.id === id)
      if (!removed) return true

      edit((players) => players.filter((existing) => existing.id !== id))
      try {
        const response = await fetch(`${BLOCKS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!response.ok) throw new Error(`unblock failed: ${response.status}`)
      } catch {
        edit((players) => (players.some((existing) => existing.id === id) ? players : insertByRecency(players, removed)))
        return false
      }
      announce(latest.current.blocked.filter((existing) => existing.id !== id))
      return true
    },
    [mode, edit, announce]
  )

  return { blocked, blockedIds, ready, block, unblock }
}
