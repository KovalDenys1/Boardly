'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'

type BroadcastHandler = (payload: unknown) => void

export interface LobbyChannelSubscriber {
  /** Broadcast event name → handler. Handlers are looked up at dispatch time. */
  events?: Record<string, BroadcastHandler>
  onStatus?: (status: string) => void
}

export interface LobbyChannelHandle {
  channel: RealtimeChannel
  release: () => void
}

interface RegistryEntry {
  channel: RealtimeChannel
  refCount: number
  subscribers: Set<LobbyChannelSubscriber>
  boundEvents: Set<string>
  lastStatus: string | null
  teardownTimer: ReturnType<typeof setTimeout> | null
}

/**
 * Module-level, ref-counted registry of lobby broadcast channels (#1000).
 *
 * Supabase's realtime client dedupes `channel(topic)` by topic name and hands
 * the second caller the *same already-joined* channel. `subscribe()` on a
 * joined channel is a no-op — its whole body is gated on the channel being
 * closed — so the second caller's status callback is never registered and
 * never fires. Two independent components open the lobby topic: the spectate
 * shell and, inside it, the real game page via `useRealtimeConnection`. The
 * shell always joins first, so the game page never heard SUBSCRIBED and its
 * `isConnected` stayed false for the spectator's whole session, which is what
 * `useLobbyChatHistory` gates the history fetch on.
 *
 * Worse, either side's cleanup called `removeChannel` on that shared object and
 * took realtime away from the other; `removeChannel` is async, so a synchronous
 * re-subscribe got the dying channel back in state 'leaving' and skipped again.
 *
 * `hooks/useFriendPresence.ts` already solved this shape for the global
 * presence topic. One subscribe and one teardown per topic, N consumers.
 */
const registry = new Map<string, RegistryEntry>()

function bindEvents(entry: RegistryEntry, events: Record<string, BroadcastHandler> | undefined) {
  if (!events) return
  for (const event of Object.keys(events)) {
    if (entry.boundEvents.has(event)) continue
    entry.boundEvents.add(event)
    entry.channel.on('broadcast', { event }, ({ payload }) => {
      entry.subscribers.forEach((subscriber) => subscriber.events?.[event]?.(payload))
    })
  }
}

export function acquireLobbyChannel(
  topic: string,
  subscriber: LobbyChannelSubscriber
): LobbyChannelHandle {
  let entry = registry.get(topic)
  const isNewChannel = entry === undefined

  if (!entry) {
    entry = {
      channel: getSupabaseClient().channel(topic),
      refCount: 0,
      subscribers: new Set(),
      boundEvents: new Set(),
      lastStatus: null,
      teardownTimer: null,
    }
    registry.set(topic, entry)
  }

  if (entry.teardownTimer !== null) {
    clearTimeout(entry.teardownTimer)
    entry.teardownTimer = null
  }

  entry.refCount += 1
  entry.subscribers.add(subscriber)
  bindEvents(entry, subscriber.events)

  if (isNewChannel) {
    const joining = entry
    joining.channel.subscribe((status) => {
      joining.lastStatus = status
      joining.subscribers.forEach((s) => s.onStatus?.(status))
    })
  } else if (entry.lastStatus !== null) {
    // A consumer arriving after the join would otherwise wait forever for a
    // status the shared channel already reported and will not report again.
    subscriber.onStatus?.(entry.lastStatus)
  }

  const acquired = entry
  let released = false
  return {
    channel: acquired.channel,
    release: () => {
      if (released) return
      released = true
      releaseLobbyChannel(topic, subscriber)
    },
  }
}

function releaseLobbyChannel(topic: string, subscriber: LobbyChannelSubscriber) {
  const entry = registry.get(topic)
  if (!entry) return

  entry.subscribers.delete(subscriber)
  entry.refCount = Math.max(0, entry.refCount - 1)
  if (entry.refCount > 0) return

  // Defer teardown a tick, as useFriendPresence does: an effect whose deps
  // changed runs cleanup and re-acquires in the same flush, and tearing the
  // channel down in between would race Supabase's async removeChannel.
  entry.teardownTimer = setTimeout(() => {
    entry.teardownTimer = null
    if (entry.refCount > 0) return
    registry.delete(topic)
    void getSupabaseClient().removeChannel(entry.channel)
  }, 0)
}

/** Test seam — drops every entry without touching the client. */
export function __resetLobbyChannelsForTests() {
  registry.forEach((entry) => {
    if (entry.teardownTimer !== null) clearTimeout(entry.teardownTimer)
  })
  registry.clear()
}
