'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'

export interface GameSocketOptions {
  code: string
  status: string
  isGuest: boolean
  guestToken: string | null
  gameName: string
  onConnect?: (socket: Socket) => void
  onGameUpdate?: (payload: Record<string, unknown>) => void
  onGameAbandoned?: (payload: { gameId: string; reason?: string }) => void
  onPlayerLeft?: (payload: {
    userId: string
    username?: string
    playerName?: string
    remainingPlayers?: number
    nextCreatorId?: string
    nextCreatorName?: string
  }) => void
  onDisconnect?: () => void
  onLobbyUpdate?: () => void
  onPlayerJoined?: () => void
  extraOptions?: {
    reconnectionAttempts?: number
    reconnectionDelayMax?: number
  }
}

// Callbacks are stored in refs so stale closures never trigger reconnects.
export function useGameSocket({
  code,
  status,
  isGuest,
  guestToken,
  gameName,
  onConnect,
  onGameUpdate,
  onGameAbandoned,
  onPlayerLeft,
  onDisconnect,
  onLobbyUpdate,
  onPlayerJoined,
  extraOptions,
}: GameSocketOptions): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null)

  const onConnectRef = useRef(onConnect)
  const onGameUpdateRef = useRef(onGameUpdate)
  const onGameAbandonedRef = useRef(onGameAbandoned)
  const onPlayerLeftRef = useRef(onPlayerLeft)
  const onDisconnectRef = useRef(onDisconnect)
  const onLobbyUpdateRef = useRef(onLobbyUpdate)
  const onPlayerJoinedRef = useRef(onPlayerJoined)

  onConnectRef.current = onConnect
  onGameUpdateRef.current = onGameUpdate
  onGameAbandonedRef.current = onGameAbandoned
  onPlayerLeftRef.current = onPlayerLeft
  onDisconnectRef.current = onDisconnect
  onLobbyUpdateRef.current = onLobbyUpdate
  onPlayerJoinedRef.current = onPlayerJoined

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
    if (isGuest && !guestToken) return

    let isMounted = true
    let activeSocket: Socket | null = null

    const initSocket = async () => {
      const url = getBrowserSocketUrl()
      const useGuestAuth = isGuest && status !== 'authenticated'
      const socketAuth = await resolveSocketClientAuth({
        isGuest: useGuestAuth,
        guestToken: useGuestAuth ? guestToken : null,
      })

      if (!socketAuth || !isMounted) {
        if (!socketAuth) clientLogger.warn(`Skipping ${gameName} socket connection: auth payload unavailable`)
        return
      }

      const newSocket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: extraOptions?.reconnectionAttempts ?? 10,
        reconnectionDelay: 1000,
        ...(extraOptions?.reconnectionDelayMax ? { reconnectionDelayMax: extraOptions.reconnectionDelayMax } : {}),
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })
      activeSocket = newSocket

      newSocket.on('connect', () => {
        clientLogger.log(`✅ ${gameName} socket connected`)
        newSocket.emit('join-lobby', code)
        onConnectRef.current?.(newSocket)
      })

      newSocket.on('game-update', (payload: Record<string, unknown>) => {
        onGameUpdateRef.current?.(payload)
      })

      newSocket.on('game-abandoned', (payload: { gameId: string; reason?: string }) => {
        onGameAbandonedRef.current?.(payload)
      })

      newSocket.on('player-left', (payload: Parameters<NonNullable<GameSocketOptions['onPlayerLeft']>>[0]) => {
        onPlayerLeftRef.current?.(payload)
      })

      newSocket.on('lobby-update', () => {
        onLobbyUpdateRef.current?.()
      })

      newSocket.on('player-joined', () => {
        onPlayerJoinedRef.current?.()
      })

      newSocket.on('disconnect', () => {
        clientLogger.log(`❌ ${gameName} socket disconnected`)
        onDisconnectRef.current?.()
      })

      setSocket(newSocket)
    }

    void initSocket()

    return () => {
      isMounted = false
      if (activeSocket?.connected) {
        activeSocket.emit('leave-lobby', code)
        activeSocket.disconnect()
      } else {
        activeSocket?.close()
      }
      setSocket(null)
    }
    // Only reconnect when auth/identity changes, not when callbacks change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isGuest, guestToken, code, gameName])

  return socket
}
