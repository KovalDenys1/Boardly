import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'

interface UseSocketConnectionProps {
  code: string
  session: any
  isGuest: boolean
  guestId: string
  guestName: string
  onGameUpdate: (data: any) => void
  onChatMessage: (message: any) => void
  onPlayerTyping: (data: any) => void
  onLobbyUpdate: (data: any) => void
  onPlayerJoined: (data: any) => void
  onGameStarted: (data: any) => void
  onGameAbandoned?: (data: any) => void
  onPlayerLeft?: (data: any) => void
  onBotAction?: (event: any) => void
}

export function useSocketConnection({
  code,
  session,
  isGuest,
  guestId,
  guestName,
  onGameUpdate,
  onChatMessage,
  onPlayerTyping,
  onLobbyUpdate,
  onPlayerJoined,
  onGameStarted,
  onGameAbandoned,
  onPlayerLeft,
  onBotAction,
}: UseSocketConnectionProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const hasConnectedOnceRef = useRef(false)

  // Use refs to store callbacks so they don't trigger socket reconnection
  const onGameUpdateRef = useRef(onGameUpdate)
  const onChatMessageRef = useRef(onChatMessage)
  const onPlayerTypingRef = useRef(onPlayerTyping)
  const onLobbyUpdateRef = useRef(onLobbyUpdate)
  const onPlayerJoinedRef = useRef(onPlayerJoined)
  const onGameStartedRef = useRef(onGameStarted)
  const onGameAbandonedRef = useRef(onGameAbandoned)
  const onPlayerLeftRef = useRef(onPlayerLeft)
  const onBotActionRef = useRef(onBotAction)

  // Update refs when callbacks change
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
  }, [onGameUpdate, onChatMessage, onPlayerTyping, onLobbyUpdate, onPlayerJoined, onGameStarted, onGameAbandoned, onPlayerLeft, onBotAction])

  useEffect(() => {
    let isMounted = true // Prevent state updates after unmount
    
    if (!code) {
      clientLogger.warn('⚠️ No lobby code provided, skipping socket connection')
      return
    }

    // For authenticated users, wait for session to load
    if (!isGuest && !session?.user?.id) {
      clientLogger.log('⏳ Waiting for session to load before connecting socket...')
      return
    }

    const url = getBrowserSocketUrl()
    clientLogger.log('🔌 Initializing socket connection', { url, code, isGuest })

    // Get authentication token
    const getAuthToken = () => {
      if (isGuest && guestId) {
        clientLogger.log('🔐 Using guest authentication:', { guestId, guestName })
        return guestId
      }
      const userId = session?.user?.id
      if (userId) {
        clientLogger.log('🔐 Using authenticated user:', { userId })
      } else {
        clientLogger.warn('⚠️ No user ID found in session:', { session })
      }
      return userId || null
    }

    const token = getAuthToken()
    
    if (!token && !isGuest) {
      clientLogger.error('❌ Cannot connect socket: No authentication token available')
      return
    }
    
    // Exponential backoff calculation: min(1000 * 2^attempt, 30000)
    const calculateBackoff = (attempt: number) => {
      const baseDelay = 1000 // 1 second
      const maxDelay = 30000 // 30 seconds
      return Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
    }

    const newSocket = io(url, {
      // Оптимізовано для Render free tier (холодні старти можуть займати до 60s)
      transports: ['polling', 'websocket'], // Polling → WebSocket для стабільності
      reconnection: true,
      reconnectionAttempts: 20, // Збільшено для холодних стартів Render
      reconnectionDelay: 3000, // 3 секунди початкова затримка
      reconnectionDelayMax: 120000, // До 2 хвилин між спробами (холодний старт)
      timeout: 120000, // 2 хвилини - важливо для холодного старту Render
      upgrade: true, // Auto-upgrade polling → websocket
      rememberUpgrade: true, // Запам'ятати успішний upgrade
      autoConnect: true, // Автоматичне підключення
      forceNew: false, // Використовувати існуюче з'єднання якщо можливо
      multiplex: true, // Multiplexing для ефективності
      path: '/socket.io/', // Явний шлях
      auth: {
        token: token,
        isGuest: isGuest,
        guestName: isGuest ? guestName : undefined,
      },
      query: {
        token: token || '',
        isGuest: isGuest ? 'true' : 'false',
        guestName: isGuest ? guestName : undefined,
      },
    })

    newSocket.on('connect', () => {
      if (!isMounted) return
      clientLogger.log('✅ Socket connected to lobby:', code)
      setIsConnected(true)
      setIsReconnecting(false)
      setReconnectAttempt(0) // Reset counter on successful connection
      hasConnectedOnceRef.current = true // Mark that we've connected at least once
      
      // Join lobby room (server expects string, not object)
      newSocket.emit('join-lobby', code)
    })

    newSocket.on('disconnect', (reason) => {
      if (!isMounted) return
      setIsConnected(false)
      
      // Only show reconnecting if we've connected before
      // This prevents showing "reconnecting" on initial page load
      if (reason !== 'io client disconnect' && hasConnectedOnceRef.current) {
        clientLogger.log('❌ Socket disconnected:', reason)
        setIsReconnecting(true)
      }
    })

    newSocket.on('reconnect_attempt', (attempt) => {
      if (!isMounted) return
      setReconnectAttempt(attempt)
      const backoff = calculateBackoff(attempt - 1)
      clientLogger.log(`🔄 Reconnection attempt #${attempt} (waiting ${backoff}ms)`)
    })

    newSocket.on('reconnect_failed', () => {
      if (!isMounted) return
      clientLogger.error('❌ Failed to reconnect after maximum attempts')
      setIsReconnecting(false)
    })

    newSocket.on('reconnect', (attempt) => {
      if (!isMounted) return
      clientLogger.log(`✅ Reconnected successfully after ${attempt} attempts`)
      setIsReconnecting(false)
      setReconnectAttempt(0)
    })

    newSocket.on('connect_error', (error) => {
      if (!isMounted) return
      clientLogger.error('🔴 Socket connection error:', error.message)
      setIsConnected(false)
      
      if (error.message.includes('timeout')) {
        clientLogger.warn('⏳ Socket connection timeout - retrying...')
      } else if (error.message.includes('Authentication failed')) {
        clientLogger.error('🔐 Authentication failed - check token')
        setIsReconnecting(false) // Don't retry if auth failed
      }
    })
    
    newSocket.on('game-update', (data) => onGameUpdateRef.current(data))
    newSocket.on('chat-message', (data) => onChatMessageRef.current(data))
    newSocket.on('player-typing', (data) => onPlayerTypingRef.current(data))
    newSocket.on('lobby-update', (data) => onLobbyUpdateRef.current(data))
    newSocket.on('player-joined', (data) => onPlayerJoinedRef.current(data))
    newSocket.on('game-started', (data) => onGameStartedRef.current(data))
    if (onGameAbandonedRef.current) {
      newSocket.on('game-abandoned', (data) => onGameAbandonedRef.current?.(data))
    }
    if (onPlayerLeftRef.current) {
      newSocket.on('player-left', (data) => onPlayerLeftRef.current?.(data))
    }
    if (onBotActionRef.current) {
      newSocket.on('bot-action', (data) => onBotActionRef.current?.(data))
    }

    if (isMounted) {
      setSocket(newSocket)
    }

    return () => {
      isMounted = false
      clientLogger.log('🔌 Cleaning up socket connection')
      
      // Remove all listeners first
      newSocket.off('connect')
      newSocket.off('disconnect')
      newSocket.off('connect_error')
      newSocket.off('reconnect_attempt')
      newSocket.off('reconnect_failed')
      newSocket.off('reconnect')
      newSocket.off('game-update')
      newSocket.off('chat-message')
      newSocket.off('player-typing')
      newSocket.off('lobby-update')
      newSocket.off('player-joined')
      newSocket.off('game-started')
      newSocket.off('game-abandoned')
      newSocket.off('player-left')
      newSocket.off('bot-action')
      
      // Gracefully disconnect only if connected
      if (newSocket.connected) {
        newSocket.disconnect()
      } else if (typeof newSocket.close === 'function') {
        // Force close if not connected yet (prevents WebSocket error)
        newSocket.close()
      }
    }
  // session?.user?.id is accessed directly in the effect, no need to add session itself
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isGuest, guestId, guestName, session?.user?.id])

  const emitWhenConnected = useCallback((event: string, data: any) => {
    if (!socket) return

    if (isConnected) {
      socket.emit(event, data)
    } else {
      socket.once('connect', () => {
        socket.emit(event, data)
      })
    }
  }, [socket, isConnected])

  return { 
    socket, 
    isConnected, 
    isReconnecting,
    reconnectAttempt,
    emitWhenConnected 
  }
}
