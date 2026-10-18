'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { getSafeLocalStorage, readLocal, removeLocal, writeLocal } from '@/lib/safe-storage'
import {
  BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX,
  BLOCKED_PLAYERS_CHANGED_EVENT,
  BLOCKED_PLAYERS_STORAGE_KEY,
} from '@/lib/user-blocks'

export type BlockedPlayer = { id: string; username: string; blockedAt: string }

export type UseBlockedPlayers = {
  /** Newest block first. Empty until `ready`. */
  blocked: BlockedPlayer[]
  blockedIds: ReadonlySet<string>
  /**
   * False while the session is loading, and for a signed-in user whose list was never read on this
   * device until the account list has answered. A list read before (kept on the device, or held by
   * another instance on the page) makes it true at once while the account is read again.
   */
  ready: boolean
  /** True while the latest read of the account list failed; `blocked` then holds the last list known, or nothing. */
  failed: boolean
  /** Reads the list again, in every instance on the page. */
  retry: () => void
  /** Resolves true once the block is kept; false when it could not be, with nothing changed (session loading, account list not loaded, the server refused, or the device would not store it). */
  block: (player: { id: string; username: string }) => Promise<boolean>
  /** Resolves true once the player is unblocked; false when it could not be, with nothing changed (same reasons as `block`). */
  unblock: (id: string) => Promise<boolean>
}

const DEVICE_LIMIT = 200
const BLOCKS_URL = '/api/user/blocks'

type Mode = 'pending' | 'account' | 'device'
/** One viewer's list: `device`, or `account:<id>`. */
type List = { key: string; players: BlockedPlayer[]; failed: boolean }
/** The changed event's detail from an instance; other senders (GuestContext, retry) send none, which means "read again". */
type Change = { source: object; list: List }

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

function listKey(mode: Mode, selfId: string | undefined): string | null {
  if (mode === 'pending') return null
  return mode === 'device' ? 'device' : `account:${selfId ?? ''}`
}

function readAccountCache(selfId: string | undefined): BlockedPlayer[] | null {
  if (!selfId) return null
  const raw = readLocal(BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX + selfId)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsePlayers(parsed) : null
  } catch {
    return null
  }
}

/** Removes every account's cached list but `keepId`'s: a device remembers only the account signed in on it. */
function forgetOtherAccounts(keepId: string | undefined) {
  const storage = getSafeLocalStorage()
  if (!storage) return
  try {
    const stale: string[] = []
    for (let index = 0; index < storage.length; index++) {
      const name = storage.key(index)
      if (name?.startsWith(BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX) && name !== BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX + keepId) {
        stale.push(name)
      }
    }
    for (const name of stale) storage.removeItem(name)
  } catch {
    // Storage is best-effort; the next load tries again.
  }
}

function samePlayers(a: BlockedPlayer[], b: BlockedPlayer[]): boolean {
  return a.length === b.length && a.every((player, index) => player.id === b[index].id)
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

// Module state lives while any instance is mounted: the chat hook stays mounted while a chat tab
// remounts its Chat, so the new Chat starts from this list instead of waiting for the server.
let mountedInstances = 0
let lastKnown: List | null = null

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

/** An account's list plus the guest blocks on this device that have not reached it yet: they stay hidden meanwhile. */
function withWaitingHandOver(players: BlockedPlayer[], selfId: string | undefined): BlockedPlayer[] {
  const waiting = newestFirst(readDevice()).filter(
    (player) => player.id !== selfId && !players.some((known) => known.id === player.id)
  )
  return waiting.length === 0 ? players : [...players, ...waiting]
}

/** What is known about a list without asking the server: the page's last list for it, the device list, or the account's cached list. */
function peek(key: string, selfId: string | undefined): List | null {
  if (lastKnown?.key === key) return lastKnown
  if (key === 'device') return { key, players: newestFirst(readDevice()), failed: false }
  const cached = readAccountCache(selfId)
  return cached ? { key, players: withWaitingHandOver(cached, selfId), failed: false } : null
}

/**
 * The viewer's own block list, one API for guests and accounts (#1466).
 *
 * Signed in, it lives on the account behind /api/user/blocks, and the last list read is kept on the
 * device so a chat never shows a blocked player while it waits. As a guest or signed out it lives
 * on this device, and the first load after sign-in moves it to the account.
 */
export function useBlockedPlayers(): UseBlockedPlayers {
  const { data: session, status } = useSession()
  const selfId = session?.user?.id
  const mode: Mode = status === 'loading' ? 'pending' : status === 'authenticated' ? 'account' : 'device'
  const key = listKey(mode, selfId)

  const [snapshot, setSnapshot] = useState<List | null>(() => (key ? peek(key, selfId) : null))
  const current = snapshot?.key === key ? snapshot : key ? peek(key, selfId) : null
  const ready = current !== null
  const failed = current?.failed === true
  const blocked = current?.players ?? NO_PLAYERS
  const blockedIds = useMemo<ReadonlySet<string>>(() => new Set(blocked.map((player) => player.id)), [blocked])

  const latest = useRef<List | null>(current)
  latest.current = current

  const loadTicket = useRef(0)
  const source = useRef({})

  useEffect(() => {
    mountedInstances++
    return () => {
      mountedInstances--
      if (mountedInstances === 0) {
        lastKnown = null
        accountReadInFlight = null
      }
    }
  }, [])

  /** Shows `list` here and hands it to every other instance; an account's list is kept on the device. */
  const publish = useCallback(
    (list: List) => {
      latest.current = list
      setSnapshot(list)
      const changed =
        !lastKnown || lastKnown.key !== list.key || lastKnown.failed !== list.failed || !samePlayers(lastKnown.players, list.players)
      lastKnown = list
      if (mode === 'account' && selfId && !list.failed) {
        writeLocal(BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX + selfId, JSON.stringify(list.players))
      }
      if (changed) {
        const change: Change = { source: source.current, list }
        window.dispatchEvent(new CustomEvent<Change>(BLOCKED_PLAYERS_CHANGED_EVENT, { detail: change }))
      }
    },
    [mode, selfId]
  )

  const load = useCallback(async () => {
    if (!key) return
    const ticket = ++loadTicket.current
    if (mode === 'device') {
      publish({ key, players: newestFirst(readDevice()), failed: false })
      return
    }
    const players = await readAccountPlayers(selfId)
    if (ticket !== loadTicket.current) return
    if (players) {
      publish({ key, players: withWaitingHandOver(players, selfId), failed: false })
      return
    }
    // A failed read keeps the last list known and ends the wait: chat must not hang on a list it cannot get.
    publish({ key, players: peek(key, selfId)?.players ?? [], failed: true })
  }, [key, mode, selfId, publish])

  useEffect(() => {
    if (mode === 'pending') return
    forgetOtherAccounts(mode === 'account' ? selfId : undefined)
    if (lastKnown && lastKnown.key !== key) lastKnown = null
  }, [mode, selfId, key])

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
      if (change) {
        if (change.list.key !== key) return
        loadTicket.current++
        latest.current = change.list
        setSnapshot(change.list)
        return
      }
      void load()
    }
    window.addEventListener(BLOCKED_PLAYERS_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(BLOCKED_PLAYERS_CHANGED_EVENT, onChanged)
  }, [mode, key, load])

  useEffect(() => {
    if (mode !== 'device') return
    const onStorage = (event: StorageEvent) => {
      if (event.key === BLOCKED_PLAYERS_STORAGE_KEY || event.key === null) void load()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [mode, load])

  const block = useCallback(
    async (player: { id: string; username: string }): Promise<boolean> => {
      if (!key) return false
      const entry: BlockedPlayer = { id: player.id, username: player.username, blockedAt: new Date().toISOString() }

      if (mode === 'device') {
        const stored = readDevice()
        if (!stored.some((existing) => existing.id === player.id)) writeDevice([...stored, entry].slice(-DEVICE_LIMIT))
        const kept = readDevice()
        publish({ key, players: newestFirst(kept), failed: false })
        return kept.some((existing) => existing.id === player.id)
      }

      const before = latest.current
      if (!before || before.key !== key) return false
      if (before.players.some((existing) => existing.id === player.id)) return true

      // Every instance hides the player now, the chat hook included, before the server answers.
      loadTicket.current++
      publish({ ...before, players: [entry, ...before.players] })
      try {
        const response = await fetch(BLOCKS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: [player.id] }),
        })
        if (!response.ok) throw new Error(`block failed: ${response.status}`)
        if (before.failed) {
          const body: unknown = await response.json().catch(() => null)
          const server = (body as { blocks?: unknown } | null)?.blocks
          if (Array.isArray(server)) {
            loadTicket.current++
            publish({ key, players: parsePlayers(server), failed: false })
          }
        }
      } catch {
        const now = latest.current?.key === key ? latest.current : before
        publish({ ...now, players: now.players.filter((existing) => existing.id !== player.id) })
        return false
      }
      return true
    },
    [key, mode, publish]
  )

  const unblock = useCallback(
    async (id: string): Promise<boolean> => {
      if (!key) return false

      if (mode === 'device') {
        writeDevice(readDevice().filter((existing) => existing.id !== id))
        const kept = readDevice()
        publish({ key, players: newestFirst(kept), failed: false })
        return !kept.some((existing) => existing.id === id)
      }

      const before = latest.current
      if (!before || before.key !== key) return false
      const removed = before.players.find((existing) => existing.id === id)
      if (!removed) return true

      loadTicket.current++
      publish({ ...before, players: before.players.filter((existing) => existing.id !== id) })
      try {
        const response = await fetch(`${BLOCKS_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!response.ok) throw new Error(`unblock failed: ${response.status}`)
      } catch {
        const now = latest.current?.key === key ? latest.current : before
        if (!now.players.some((existing) => existing.id === id)) publish({ ...now, players: insertByRecency(now.players, removed) })
        return false
      }
      return true
    },
    [key, mode, publish]
  )

  const retry = useCallback(() => {
    window.dispatchEvent(new CustomEvent(BLOCKED_PLAYERS_CHANGED_EVENT))
  }, [])

  return { blocked, blockedIds, ready, failed, block, unblock, retry }
}
