'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'
import { acquireLobbyChannel } from '@/lib/lobby-channel-registry'
import { fetchLobbyTopic } from '@/lib/lobby-realtime-topic-client'
import { clientLogger } from '@/lib/client-logger'
import { LOBBY_PEER_EVENTS, readSpectatorCount } from '@/lib/shared/realtime-envelope'
import type { GameUpdatePayload, ChatMessagePayload, LobbyUpdatePayload, PlayerJoinedPayload, GameStartedPayload } from '@/types/game'
import type { GameAbandonedPayload, PlayerLeftPayload } from '@/types/realtime-events'
import type { BaseBotActionEvent } from '@/lib/bots'

export interface GameResetPayload {
  lobbyCode: string
  gameId: string
}

interface UseRealtimeConnectionProps {
  code: string
  /**
   * Connect and subscribe only after user is confirmed as a lobby member.
   * Mirrors the shouldJoinLobbyRoom prop from useSocketConnection.
   */
  shouldJoinLobbyRoom?: boolean
  onGameUpdate?: (data: GameUpdatePayload) => void
  onChatMessage?: (message: ChatMessagePayload) => void
  onLobbyUpdate?: (data: LobbyUpdatePayload) => void
  onPlayerJoined?: (data: PlayerJoinedPayload) => void
  onGameStarted?: (data: GameStartedPayload) => void
  onGameAbandoned?: (data: GameAbandonedPayload) => void
  onPlayerLeft?: (data: PlayerLeftPayload) => void
  onBotAction?: (event: BaseBotActionEvent) => void
  onSpectatorCountChange?: (count: number) => void
  onStateSync?: () => Promise<void>
  onGameReset?: (data: GameResetPayload) => void
  /** Sketch & Guess: the drawer's canvas as it is drawn, client to client. */
  onSketchLive?: (payload: unknown) => void
}

export function useRealtimeConnection({
  code,
  shouldJoinLobbyRoom = true,
  onGameUpdate,
  onChatMessage,
  onLobbyUpdate,
  onPlayerJoined,
  onGameStarted,
  onGameAbandoned,
  onPlayerLeft,
  onBotAction,
  onSpectatorCountChange,
  onStateSync,
  onGameReset,
  onSketchLive,
}: UseRealtimeConnectionProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [hasConnectedOnce, setHasConnectedOnce] = useState(false)
  // The broadcast topic is no longer `lobby:{code}` — it carries a per-lobby
  // secret that only a member may fetch (#845), so subscribing waits on it.
  const [topic, setTopic] = useState<string | null>(null)
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null)
  const lobbiesChannelRef = useRef<RealtimeChannel | null>(null)
  const hasConnectedOnceRef = useRef(false)

  // Refs for callbacks — prevents re-subscribing when handlers change
  const onGameUpdateRef = useRef(onGameUpdate)
  const onChatMessageRef = useRef(onChatMessage)
  const onLobbyUpdateRef = useRef(onLobbyUpdate)
  const onPlayerJoinedRef = useRef(onPlayerJoined)
  const onGameStartedRef = useRef(onGameStarted)
  const onGameAbandonedRef = useRef(onGameAbandoned)
  const onPlayerLeftRef = useRef(onPlayerLeft)
  const onBotActionRef = useRef(onBotAction)
  const onSpectatorCountChangeRef = useRef(onSpectatorCountChange)
  const onStateSyncRef = useRef(onStateSync)
  const onGameResetRef = useRef(onGameReset)
  const onSketchLiveRef = useRef(onSketchLive)

  useEffect(() => {
    onGameUpdateRef.current = onGameUpdate
    onChatMessageRef.current = onChatMessage
    onLobbyUpdateRef.current = onLobbyUpdate
    onPlayerJoinedRef.current = onPlayerJoined
    onGameStartedRef.current = onGameStarted
    onGameAbandonedRef.current = onGameAbandoned
    onPlayerLeftRef.current = onPlayerLeft
    onBotActionRef.current = onBotAction
    onSpectatorCountChangeRef.current = onSpectatorCountChange
    onStateSyncRef.current = onStateSync
    onGameResetRef.current = onGameReset
    onSketchLiveRef.current = onSketchLive
  }, [onGameUpdate, onChatMessage, onLobbyUpdate, onPlayerJoined, onGameStarted, onGameAbandoned, onPlayerLeft, onBotAction, onSpectatorCountChange, onStateSync, onGameReset, onSketchLive])

  useEffect(() => {
    if (!code || !shouldJoinLobbyRoom) {
      setTopic(null)
      return
    }

    let cancelled = false

    void fetchLobbyTopic(code, () => cancelled).then((resolved) => {
      if (!cancelled && resolved) setTopic(resolved)
    })

    return () => {
      cancelled = true
      setTopic(null)
    }
  }, [code, shouldJoinLobbyRoom])

  useEffect(() => {
    if (!code || !shouldJoinLobbyRoom || !topic) {
      setIsConnected(false)
      return
    }

    const supabase = getSupabaseClient()

    // The spectate shell opens this same topic, and the client hands both of us
    // one channel object — so the subscribe and the teardown are shared (#1000).
    const lobbyChannel = acquireLobbyChannel(topic, {
      events: {
        'game-update': (payload) => {
          clientLogger.log('📡 game-update via Supabase Broadcast')
          onGameUpdateRef.current?.(payload as GameUpdatePayload)
        },
        'chat-message': (payload) => {
          onChatMessageRef.current?.(payload as ChatMessagePayload)
        },
        'player-joined': (payload) => {
          clientLogger.log('📡 player-joined via Supabase Broadcast')
          onPlayerJoinedRef.current?.(payload as PlayerJoinedPayload)
        },
        'player-left': (payload) => {
          clientLogger.log('📡 player-left via Supabase Broadcast')
          onPlayerLeftRef.current?.(payload as PlayerLeftPayload)
        },
        'game-started': (payload) => {
          clientLogger.log('📡 game-started via Supabase Broadcast')
          onGameStartedRef.current?.(payload as GameStartedPayload)
        },
        'game-abandoned': (payload) => {
          clientLogger.log('📡 game-abandoned via Supabase Broadcast')
          onGameAbandonedRef.current?.(payload as GameAbandonedPayload)
        },
        'bot-action': (payload) => {
          onBotActionRef.current?.(payload as BaseBotActionEvent)
        },
        'game-reset': (payload) => {
          clientLogger.log('📡 game-reset via Supabase Broadcast')
          onGameResetRef.current?.(payload as GameResetPayload)
        },
        'sketch-live': (payload) => {
          onSketchLiveRef.current?.(payload)
        },
        // Signed by PATCH /api/lobby/[code]/spectator-count; still clamped.
        'spectator-count-update': (payload) => {
          onSpectatorCountChangeRef.current?.(readSpectatorCount(payload))
        },
      },
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') {
          clientLogger.log('✅ Supabase Realtime connected:', topic)
          setIsConnected(true)
          const isReconnect = hasConnectedOnceRef.current
          hasConnectedOnceRef.current = true
          setHasConnectedOnce(true)
          if (isReconnect && onStateSyncRef.current) {
            void onStateSyncRef.current().catch((err) => {
              clientLogger.warn('State sync after reconnect failed:', err)
            })
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          clientLogger.warn('⚠️ Supabase Realtime channel closed/errored:', status)
          setIsConnected(false)
        }
      },
    })

    broadcastChannelRef.current = lobbyChannel.channel

    // Postgres Changes on Lobbies — catches settings updates, creator reassignment, deactivation
    const lobbiesChannel = supabase
      .channel(`lobby-pg:${code}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Lobbies', filter: `code=eq.${code}` },
        () => {
          clientLogger.log('📡 Lobby row changed via Postgres Changes')
          onLobbyUpdateRef.current?.({ lobbyCode: code })
        }
      )
      .subscribe()

    lobbiesChannelRef.current = lobbiesChannel

    return () => {
      clientLogger.log('🔌 Cleaning up Supabase Realtime channels')
      lobbyChannel.release()
      void supabase.removeChannel(lobbiesChannel)
      broadcastChannelRef.current = null
      lobbiesChannelRef.current = null
      setIsConnected(false)
    }
  }, [code, shouldJoinLobbyRoom, topic])

  // Clients may only send the peer events (lib/shared/realtime-envelope.ts).
  // Anything else would be dropped by every receiver as unsigned, so refusing
  // it here turns a silent no-op into a visible mistake in development.
  const emitWhenConnected = useCallback(
    (event: string, data: unknown) => {
      if (!LOBBY_PEER_EVENTS.has(event)) {
        clientLogger.warn(`⚠️ "${event}" is a server event; clients cannot send it on the lobby topic`)
        return
      }
      const channel = broadcastChannelRef.current
      if (!channel) return
      void channel.send({
        type: 'broadcast',
        event,
        payload: data as Record<string, unknown>,
      })
    },
    []
  )

  // #987: this was hardcoded `false`, so the "Reconnecting…" UI was dead and
  // `useLobbyChatHistory` never re-fetched the messages missed while the socket
  // was down. Having connected once and not being connected now is exactly it.
  const isReconnecting = hasConnectedOnce && !isConnected

  return {
    isConnected,
    isReconnecting,
    reconnectAttempt: 0 as const,
    emitWhenConnected,
  }
}
