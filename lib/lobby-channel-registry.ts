'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'
import { clientLogger } from '@/lib/client-logger'
import {
  createRealtimeReplayGuard,
  openRealtimeMessage,
  prefetchRealtimeVerifierKey,
  refreshRealtimeClock,
  restartReplayWindow,
  type RealtimeRejectReason,
  type RealtimeReplayGuard,
} from '@/lib/client/realtime-verify'
import { isLobbyPeerEvent, isRealtimeEnvelope } from '@/lib/shared/realtime-envelope'

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
  /** Frames are verified one at a time, so handlers see them in arrival order. */
  inbox: Promise<void>
  replayGuard: RealtimeReplayGuard
  hasSubscribedOnce: boolean
  loggedRejections: number
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
 *
 * It is also the one place a broadcast turns into a handler call, which makes
 * it the gate for signed realtime (GHSA-g868-9224-wr3p): every frame goes
 * through `openRealtimeMessage` first, and only what the server signed for
 * this topic and event – plus the few peer events clients send each other by
 * design – reaches a handler. Nothing in the topic's name restricts who can
 * send on it; this is what restricts whose messages are believed. The
 * registry is not lobby-specific: the per-user topic (invites, notification
 * pokes) goes through it as well.
 */
const registry = new Map<string, RegistryEntry>()

const MAX_LOGGED_REJECTIONS = 5

function reportRejection(entry: RegistryEntry, topic: string, event: string, reason: RealtimeRejectReason) {
  // A replay or a stale frame is the guard doing its job quietly; the rest
  // mean somebody sent something the server did not, or the key is missing.
  if (reason === 'replayed' || reason === 'stale') return
  if (entry.loggedRejections >= MAX_LOGGED_REJECTIONS) return
  entry.loggedRejections += 1
  clientLogger.warn('⚠️ Dropped a realtime message the server did not sign', { topic: topic.split(':')[0], event, reason })
}

function dispatch(entry: RegistryEntry, event: string, payload: unknown) {
  entry.subscribers.forEach((subscriber) => {
    try {
      subscriber.events?.[event]?.(payload)
    } catch (error) {
      clientLogger.error('Realtime handler threw', { event, error })
    }
  })
}

function deliver(entry: RegistryEntry, topic: string, event: string, raw: unknown): Promise<void> {
  return openRealtimeMessage(topic, event, raw, entry.replayGuard).then((opened) => {
    if (!opened.ok) {
      reportRejection(entry, topic, event, opened.reason)
      return
    }
    dispatch(entry, event, opened.payload)
  })
}

function bindEvents(entry: RegistryEntry, topic: string, events: Record<string, BroadcastHandler> | undefined) {
  if (!events) return
  for (const event of Object.keys(events)) {
    if (entry.boundEvents.has(event)) continue
    entry.boundEvents.add(event)
    entry.channel.on('broadcast', { event }, ({ payload }) => {
      // A peer frame (live drawing strokes, ten a second) has no signature to
      // wait for and must not queue behind one that does; its handlers treat
      // it as untrusted anyway.
      if (isLobbyPeerEvent(topic, event) && !isRealtimeEnvelope(payload)) {
        if (payload !== null && typeof payload === 'object') dispatch(entry, event, payload)
        return
      }
      entry.inbox = entry.inbox
        .then(() => deliver(entry, topic, event, payload))
        .catch((error) => clientLogger.error('Realtime delivery failed', { event, error }))
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
      inbox: Promise.resolve(),
      replayGuard: createRealtimeReplayGuard(),
      hasSubscribedOnce: false,
      loggedRejections: 0,
    }
    registry.set(topic, entry)
    prefetchRealtimeVerifierKey()
  }

  if (entry.teardownTimer !== null) {
    clearTimeout(entry.teardownTimer)
    entry.teardownTimer = null
  }

  entry.refCount += 1
  entry.subscribers.add(subscriber)
  bindEvents(entry, topic, subscriber.events)

  if (isNewChannel) {
    const joining = entry
    joining.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        restartReplayWindow(joining.replayGuard)
        if (joining.hasSubscribedOnce) refreshRealtimeClock()
        joining.hasSubscribedOnce = true
      }
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

/**
 * The same registry under a name that does not say "lobby": the per-user
 * topic (invites, rematch requests, notification pokes) is shared by two
 * components and needs the same one-subscribe-per-topic handling and the same
 * signature gate.
 */
export const acquireRealtimeChannel = acquireLobbyChannel

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
