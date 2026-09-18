'use client'

import { useEffect, useState } from 'react'
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'
import type { TranslationKeys } from '@/lib/i18n-helpers'

export type FriendPresence = 'offline' | 'online' | 'in_lobby' | 'in_game'

/** Global Supabase Presence channel every authenticated client tracks itself on. */
export const ONLINE_USERS_CHANNEL = 'online-users'

/**
 * The join key for that channel. It is a constant on purpose — one shared,
 * ref-counted channel serves every consumer on the page (see below), so there is
 * no per-consumer key to give it. Who is online is read from the tracked
 * payloads instead; see `readOnlineUserIds`.
 */
const PRESENCE_KEY = 'reader'

export const PRESENCE_PRIORITY: Record<FriendPresence, number> = {
  in_game: 0,
  in_lobby: 1,
  online: 2,
  offline: 3,
}

/**
 * Module-level, ref-counted shared channel for ONLINE_USERS_CHANNEL.
 *
 * Supabase's realtime client dedupes `channel(topic)` calls by topic name —
 * a second call with the same topic returns the *same already-joined*
 * channel object rather than a new one. Calling `.on('presence', ...)` on an
 * already-joined channel throws ("cannot add `presence` callbacks ... after
 * `subscribe()`"). Multiple independent consumers on one page (the global
 * PresenceTracker plus any number of useOnlinePresence() readers, and React
 * Strict Mode's dev-only double-invoke of effects) would each otherwise try
 * to create+subscribe their own channel for this same topic. Sharing one
 * subscribe() call via ref-counting avoids that entirely.
 */
let sharedChannel: RealtimeChannel | null = null
let subscribedPromise: Promise<void> | null = null
let refCount = 0
let teardownTimer: ReturnType<typeof setTimeout> | null = null
const syncListeners = new Set<() => void>()

function acquireChannel(): { channel: RealtimeChannel; ready: Promise<void> } {
  if (teardownTimer !== null) {
    clearTimeout(teardownTimer)
    teardownTimer = null
  }
  refCount += 1

  if (!sharedChannel) {
    const supabase = getSupabaseClient()
    const channel = supabase.channel(ONLINE_USERS_CHANNEL, {
      config: { presence: { key: PRESENCE_KEY } },
    })
    channel.on('presence', { event: 'sync' }, () => {
      syncListeners.forEach((listener) => listener())
    })
    subscribedPromise = new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
      })
    })
    sharedChannel = channel
  }

  return { channel: sharedChannel, ready: subscribedPromise! }
}

function releaseChannel() {
  refCount = Math.max(0, refCount - 1)
  if (refCount > 0) return

  // Defer teardown by a tick: React Strict Mode's dev-only double-invoke
  // (mount -> cleanup -> mount) would otherwise tear down and immediately
  // need a fresh channel, racing Supabase's async removeChannel and hitting
  // the same already-joined-channel issue this module exists to avoid.
  teardownTimer = setTimeout(() => {
    teardownTimer = null
    if (refCount > 0) return
    const channel = sharedChannel
    sharedChannel = null
    subscribedPromise = null
    if (channel) {
      const supabase = getSupabaseClient()
      void supabase.removeChannel(channel)
    }
  }, 0)
}

/**
 * The user ids in a presence state, read out of the tracked payloads.
 *
 * Not out of the keys: the shared channel joins with the constant key
 * `PRESENCE_KEY`, so every client is filed under the same one and
 * `Object.keys(presenceState())` is that literal, never a user id (#1010). The
 * spectator channel reads its payloads the same way
 * (app/lobby/[code]/spectate/page.tsx).
 */
export function readOnlineUserIds(
  state: RealtimePresenceState<{ userId?: string }>
): Set<string> {
  const ids = new Set<string>()
  for (const meta of Object.values(state).flat()) {
    if (typeof meta.userId === 'string' && meta.userId.length > 0) {
      ids.add(meta.userId)
    }
  }
  return ids
}

/**
 * Subscribes to the global presence channel and returns the live set of
 * currently-online userIds. Read-only (never calls `.track()`) — use
 * `useAnnouncePresence` to announce the current user's own presence.
 */
export function useOnlinePresence(): Set<string> {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const { channel } = acquireChannel()
    const sync = () =>
      setOnlineIds(readOnlineUserIds(channel.presenceState<{ userId?: string }>()))
    syncListeners.add(sync)
    sync()
    return () => {
      syncListeners.delete(sync)
      releaseChannel()
    }
  }, [])

  return onlineIds
}

/**
 * Announces the current user's presence on the global channel for as long
 * as the calling component is mounted and `enabled` is true. No-ops when
 * `userId` is unset or `enabled` is false (e.g. "Show online status" off).
 */
export function useAnnouncePresence(userId: string | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!userId || !enabled) return

    const { channel, ready } = acquireChannel()
    let active = true
    void ready.then(() => {
      if (active) void channel.track({ userId })
    })

    return () => {
      active = false
      // Explicit untrack (not just ref-count teardown): the shared channel
      // often stays open because other read-only consumers (useOnlinePresence)
      // are still mounted, so releaseChannel() alone would leave this user's
      // presence entry visible even after they disable "Show online status"
      // or this component unmounts.
      void channel.untrack()
      releaseChannel()
    }
  }, [userId, enabled])
}

/** Translated label for a friend's presence status, or `null` for offline (no badge shown). */
export function getFriendPresenceLabel(
  presence: FriendPresence,
  t: (key: TranslationKeys, options?: string | Record<string, unknown>) => string
): string | null {
  switch (presence) {
    case 'in_game':
      return t('profile.friends.presence.inGame')
    case 'in_lobby':
      return t('profile.friends.presence.inLobby')
    case 'online':
      return t('profile.friends.presence.online')
    default:
      return null
  }
}

/** Combine server-derived presence (in_game/in_lobby/offline) with the live online-channel signal. */
export function mergeFriendPresence(
  serverPresence: FriendPresence | undefined,
  isOnlineLive: boolean
): FriendPresence {
  if (serverPresence === 'in_game' || serverPresence === 'in_lobby') {
    return serverPresence
  }
  return isOnlineLive ? 'online' : 'offline'
}

export function sortFriendsByPresence<T>(
  friends: T[],
  resolvePresence: (friend: T) => FriendPresence,
  resolveName: (friend: T) => string
): T[] {
  return [...friends].sort((a, b) => {
    const diff = PRESENCE_PRIORITY[resolvePresence(a)] - PRESENCE_PRIORITY[resolvePresence(b)]
    if (diff !== 0) return diff
    return resolveName(a).localeCompare(resolveName(b))
  })
}

/** Test-only: resets the module-level shared channel state between test cases. */
export function __resetSharedChannelForTests(): void {
  if (teardownTimer !== null) {
    clearTimeout(teardownTimer)
    teardownTimer = null
  }
  sharedChannel = null
  subscribedPromise = null
  refCount = 0
  syncListeners.clear()
}
