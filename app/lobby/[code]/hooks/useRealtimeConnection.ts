'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase-client'
import { clientLogger } from '@/lib/client-logger'
import type { GameUpdatePayload, ChatMessagePayload, PlayerTypingPayload, LobbyUpdatePayload, PlayerJoinedPayload, GameStartedPayload } from '@/types/game'
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
  onPlayerTyping?: (data: PlayerTypingPayload) => void
  onLobbyUpdate?: (data: LobbyUpdatePayload) => void
  onPlayerJoined?: (data: PlayerJoinedPayload) => void
  onGameStarted?: (data: GameStartedPayload) => void
  onGameAbandoned?: (data: GameAbandonedPayload) => void
  onPlayerLeft?: (data: PlayerLeftPayload) => void
  onBotAction?: (event: BaseBotActionEvent) => void
  onSpectatorCountChange?: (count: number) => void
  onStateSync?: () => Promise<void>
  onGameReset?: (data: GameResetPayload) => void
}

export function useRealtimeConnection({
  code,
  shouldJoinLobbyRoom = true,
  onGameUpdate,
  onChatMessage,
  onPlayerTyping,
  onLobbyUpdate,
  onPlayerJoined,
  onGameStarted,
  onGameAbandoned,
  onPlayerLeft,
  onBotAction,
  onStateSync,
  onGameReset,
}: UseRealtimeConnectionProps) {
  const [isConnected, setIsConnected] = useState(false)
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null)
  const lobbiesChannelRef = useRef<RealtimeChannel | null>(null)
  const hasConnectedOnceRef = useRef(false)

  // Refs for callbacks — prevents re-subscribing when handlers change
  const onGameUpdateRef = useRef(onGameUpdate)
  const onChatMessageRef = useRef(onChatMessage)
  const onPlayerTypingRef = useRef(onPlayerTyping)
  const onLobbyUpdateRef = useRef(onLobbyUpdate)
  const onPlayerJoinedRef = useRef(onPlayerJoined)
  const onGameStartedRef = useRef(onGameStarted)
  const onGameAbandonedRef = useRef(onGameAbandoned)
  const onPlayerLeftRef = useRef(onPlayerLeft)
  const onBotActionRef = useRef(onBotAction)
  const onStateSyncRef = useRef(onStateSync)
  const onGameResetRef = useRef(onGameReset)

  useEffect(() => {
    onGameUpdateRef.current = onGameUpdate
    onChatMessageRef.current = onChatMessage
    onPlayerTypingRef.current = onPlayerTyping
    onLobbyUpdateRef.current = onLobbyUpdate
    onPlayerJoinedRef.current = onPlayerJoined
    onGameStartedRef.current = onGameStarted
    onGameAbandonedRef.current = onGameAbandoned
    onPlayerLeftRef.current = onPlayerLeft
    onBotActionRef.current = onBotAction
    onStateSyncRef.current = onStateSync
    onGameResetRef.current = onGameReset
  }, [onGameUpdate, onChatMessage, onPlayerTyping, onLobbyUpdate, onPlayerJoined, onGameStarted, onGameAbandoned, onPlayerLeft, onBotAction, onStateSync, onGameReset])

  useEffect(() => {
    if (!code || !shouldJoinLobbyRoom) {
      setIsConnected(false)
      return
    }

    const supabase = getSupabaseClient()

    const broadcastChannel = supabase
      .channel(`lobby:${code}`)
      .on('broadcast', { event: 'game-update' }, ({ payload }) => {
        clientLogger.log('📡 game-update via Supabase Broadcast')
        onGameUpdateRef.current?.(payload as GameUpdatePayload)
      })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        onChatMessageRef.current?.(payload as ChatMessagePayload)
      })
      .on('broadcast', { event: 'player-typing' }, ({ payload }) => {
        onPlayerTypingRef.current?.(payload as PlayerTypingPayload)
      })
      .on('broadcast', { event: 'player-joined' }, ({ payload }) => {
        clientLogger.log('📡 player-joined via Supabase Broadcast')
        onPlayerJoinedRef.current?.(payload as PlayerJoinedPayload)
      })
      .on('broadcast', { event: 'player-left' }, ({ payload }) => {
        clientLogger.log('📡 player-left via Supabase Broadcast')
        onPlayerLeftRef.current?.(payload as PlayerLeftPayload)
      })
      .on('broadcast', { event: 'game-started' }, ({ payload }) => {
        clientLogger.log('📡 game-started via Supabase Broadcast')
        onGameStartedRef.current?.(payload as GameStartedPayload)
      })
      .on('broadcast', { event: 'game-abandoned' }, ({ payload }) => {
        clientLogger.log('📡 game-abandoned via Supabase Broadcast')
        onGameAbandonedRef.current?.(payload as GameAbandonedPayload)
      })
      .on('broadcast', { event: 'bot-action' }, ({ payload }) => {
        onBotActionRef.current?.(payload as BaseBotActionEvent)
      })
      .on('broadcast', { event: 'game-reset' }, ({ payload }) => {
        clientLogger.log('📡 game-reset via Supabase Broadcast')
        onGameResetRef.current?.(payload as GameResetPayload)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clientLogger.log('✅ Supabase Realtime connected:', `lobby:${code}`)
          setIsConnected(true)
          const isReconnect = hasConnectedOnceRef.current
          hasConnectedOnceRef.current = true
          if (isReconnect && onStateSyncRef.current) {
            void onStateSyncRef.current().catch((err) => {
              clientLogger.warn('State sync after reconnect failed:', err)
            })
          }
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          clientLogger.warn('⚠️ Supabase Realtime channel closed/errored:', status)
          setIsConnected(false)
        }
      })

    broadcastChannelRef.current = broadcastChannel

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
      void supabase.removeChannel(broadcastChannel)
      void supabase.removeChannel(lobbiesChannel)
      broadcastChannelRef.current = null
      lobbiesChannelRef.current = null
      setIsConnected(false)
    }
  }, [code, shouldJoinLobbyRoom])

  const emitWhenConnected = useCallback(
    (event: string, data: unknown) => {
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

  return {
    isConnected,
    isReconnecting: false as const,
    reconnectAttempt: 0 as const,
    emitWhenConnected,
  }
}
