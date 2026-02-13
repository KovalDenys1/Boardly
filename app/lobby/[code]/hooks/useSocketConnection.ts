import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { SocketEvents, ServerErrorPayload } from '@/types/socket-events'
import { showToast } from '@/lib/i18n-toast'

interface UseSocketConnectionProps {
  code: string
  session: any
  isGuest: boolean
  guestId: string | null
  guestName: string | null
  guestToken: string | null
  onGameUpdate: (data: any) => void
  onChatMessage: (message: any) => void
  onPlayerTyping: (data: any) => void
  onLobbyUpdate: (data: any) => void
  onPlayerJoined: (data: any) => void
  onGameStarted: (data: any) => void
  onGameAbandoned?: (data: any) => void
  onPlayerLeft?: (data: any) => void
  onBotAction?: (event: any) => void
  /** Callback to sync state after reconnection */
  onStateSync?: () => Promise<void>
}

export function useSocketConnection({
  code,
  session,
  isGuest,
  guestId,
  guestName,
  guestToken,
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
}: UseSocketConnectionProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const hasConnectedOnceRef = useRef(false)
  const authFailedRef = useRef(false) // Track authentication failures
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastProcessedSequenceRef = useRef(0) // Track event sequence to prevent duplicates
  const isRejoiningRef = useRef(false) // Prevent multiple rejoin attempts

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
  const onStateSyncRef = useRef(onStateSync)

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
    onStateSyncRef.current = onStateSync
  }, [onGameUpdate, onChatMessage, onPlayerTyping, onLobbyUpdate, onPlayerJoined, onGameStarted, onGameAbandoned, onPlayerLeft, onBotAction, onStateSync])

  useEffect(() => {
    let isMounted = true // Prevent state updates after unmount

    // Clear any existing reconnect timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (!code) {
      clientLogger.warn('⚠️ No lobby code provided, skipping socket connection')
      return
    }

    if (isGuest && !guestToken) {
      clientLogger.log('⏳ Waiting for guest token before connecting socket...')
      authFailedRef.current = false
      return
    }

    // For authenticated users, wait for session to load
    if (!isGuest && !session?.user?.id) {
      clientLogger.log('⏳ Waiting for session to load before connecting socket...', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id
      })
      // Reset auth failed flag when waiting for session
      authFailedRef.current = false
      return
    }

    // Additional validation for authenticated users
    if (!isGuest && session?.user?.id) {
      const userId = session.user.id
      // Validate userId format (should be a CUID or similar)
      if (typeof userId !== 'string' || userId.length < 10) {
        clientLogger.error('❌ Invalid user ID format in session:', {
          userId,
          userIdType: typeof userId,
          userIdLength: userId ? String(userId).length : 0
        })
        authFailedRef.current = true
        showToast.error('errors.authenticationFailed')
        return
      }
    }

    // Don't retry if authentication failed
    if (authFailedRef.current) {
      clientLogger.warn('⚠️ Skipping socket connection - authentication previously failed')
      return
    }

    const url = getBrowserSocketUrl()
    clientLogger.log('🔌 Initializing socket connection', {
      url,
      code,
      isGuest,
      userId: !isGuest ? session?.user?.id : guestId
    })

    // Get authentication token for Socket.IO
    // For guests: use guest token from context
    // For authenticated users: fetch short-lived JWT from API
    const getAuthToken = async () => {
      if (isGuest && guestToken) {
        clientLogger.log('🔐 Using guest authentication token', {
          guestId,
          guestName,
          hasToken: true,
        })
        return guestToken
      }
      
      // For authenticated users: fetch Socket.IO token from API
      if (!isGuest && session?.user?.id) {
        try {
          clientLogger.log('🔐 Fetching Socket.IO token for authenticated user...')
          const response = await fetch('/api/socket/token')
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          const data = await response.json()
          if (!data.token) {
            throw new Error('No token in response')
          }
          clientLogger.log('✅ Socket.IO token fetched successfully')
          return data.token
        } catch (error) {
          clientLogger.error('❌ Failed to fetch Socket.IO token:', error)
          return null
        }
      }
      
      return null
    }

    const initSocket = async () => {
      const token = await getAuthToken()
      
      if (!isGuest && !token) {
        clientLogger.error('❌ Failed to get authentication token for socket connection')
        authFailedRef.current = true
        showToast.error('errors.authenticationFailed')
        return null
      }

      // Exponential backoff calculation: min(1000 * 2^attempt, 30000)
      const calculateBackoff = (attempt: number) => {
        const baseDelay = 1000 // 1 second
        const maxDelay = 30000 // 30 seconds
        return Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      }

      const authPayload: Record<string, unknown> = {}
      if (token) authPayload.token = token
      if (isGuest) authPayload.isGuest = true

      const queryPayload: Record<string, string> = {}
      if (token) queryPayload.token = String(token)
      if (isGuest) queryPayload.isGuest = 'true'

      return { authPayload, queryPayload, calculateBackoff, token }
    }

    // Initialize socket auth and create connection
    const initAndConnect = async () => {
      const authData = await initSocket()
      if (!authData) return

      const { authPayload, queryPayload, calculateBackoff, token } = authData

      const newSocket = io(url, {
      // Optimized for Render free tier (cold starts can take up to 60s)
      transports: ['polling', 'websocket'], // Polling → WebSocket for stability
      reconnection: true,
      reconnectionAttempts: 20, // Increased for Render cold starts
      reconnectionDelay: 3000, // 3 seconds initial delay
      reconnectionDelayMax: 120000, // Up to 2 minutes between attempts (cold start)
      timeout: 180000, // 3 minutes - important for Render cold start (increased from 2 min)
      upgrade: true, // Auto-upgrade polling → websocket
      rememberUpgrade: true, // Remember successful upgrade
      autoConnect: true, // Automatic connection
      forceNew: false, // Use existing connection if possible
      multiplex: true, // Multiplexing for efficiency
      path: '/socket.io/', // Explicit path
      // Additional stability settings
      closeOnBeforeunload: false, // Don't close on page reload
      withCredentials: true, // Required for NextAuth cookie-based socket auth
      auth: authPayload,
      query: queryPayload,
    })

    newSocket.on('connect', async () => {
      if (!isMounted) return

      const isReconnect = hasConnectedOnceRef.current
      clientLogger.log(isReconnect ? '🔄 Socket reconnected to lobby:' : '✅ Socket connected to lobby:', code)

      // Reset dedup cursor on each fresh transport session.
      // Server sequence counters are in-memory and can reset on restart/redeploy.
      lastProcessedSequenceRef.current = 0

      setIsConnected(true)
      setIsReconnecting(false)
      setReconnectAttempt(0) // Reset counter on successful connection

      // Always rejoin room on connect/reconnect
      if (!isRejoiningRef.current) {
        isRejoiningRef.current = true
        newSocket.emit(SocketEvents.JOIN_LOBBY, code)

        // On reconnect, sync state to catch up on missed events
        if (isReconnect && onStateSyncRef.current) {
          try {
            clientLogger.log('🔄 Syncing state after reconnect...')
            await onStateSyncRef.current()
            clientLogger.log('✅ State synced successfully')
          } catch (error) {
            clientLogger.error('❌ Failed to sync state after reconnect:', error)
          }
        }

        isRejoiningRef.current = false
      }

      hasConnectedOnceRef.current = true // Mark that we've connected at least once
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

      const errorMsg = error.message || String(error)
      clientLogger.error('🔴 Socket connection error:', errorMsg, {
        isGuest,
        hasToken: !!token,
        tokenPreview: token ? String(token).substring(0, 10) + '...' : 'none',
        reconnectAttempt,
        errorType: (error as any).type,
        errorDescription: (error as any).description
      })

      setIsConnected(false)

      if (errorMsg.includes('timeout')) {
        clientLogger.warn('⏳ Socket connection timeout - retrying...')
        // Only show toast after multiple timeout failures
        if (reconnectAttempt > 3) {
          showToast.error('errors.connectionTimeout')
        }
      } else if (errorMsg.includes('xhr poll error')) {
        clientLogger.warn('⚠️ XHR poll error detected', {
          attempt: reconnectAttempt,
          hasToken: !!token,
          isGuest,
          message: 'This usually means the server is unreachable or authentication failed'
        })

        // For non-guest users, if we get poll error, check if token is valid
        if (!isGuest && reconnectAttempt === 0) {
          clientLogger.log('🔍 First poll error for authenticated user - checking token:', {
            tokenType: typeof token,
            tokenValue: token,
            sessionExists: !!session,
            userIdInSession: session?.user?.id
          })
        }

        // Show toast after a few attempts
        if (reconnectAttempt > 3) {
          showToast.error('errors.connectionFailed')
        }
      } else if (errorMsg.includes('Authentication failed') || errorMsg.includes('Authentication required')) {
        clientLogger.error('🔐 Authentication failed - stopping reconnection attempts')
        authFailedRef.current = true // Mark auth as failed
        setIsReconnecting(false) // Stop showing reconnecting state

        // Show user-friendly error
        showToast.error('errors.authenticationFailed')

        // Stop any further reconnection attempts
        if (newSocket) {
          newSocket.removeAllListeners()
          newSocket.close()
        }

        // Set timeout to reset auth flag after 5 seconds (allow retry after page refresh/navigation)
        reconnectTimeoutRef.current = setTimeout(() => {
          clientLogger.log('🔄 Resetting authentication flag - retry allowed')
          authFailedRef.current = false
        }, 5000)
      } else {
        // Generic connection error
        clientLogger.error('❌ Socket error:', error.message)
        if (reconnectAttempt > 5) {
          showToast.error('errors.connectionError')
        }
      }
    })

    // Add generic error handler
    newSocket.on(SocketEvents.ERROR, (error) => {
      if (!isMounted) return
      clientLogger.error('🔴 Socket error:', error)
    })

    // Add server error handler with structured errors
    newSocket.on(SocketEvents.SERVER_ERROR, (data: ServerErrorPayload) => {
      if (!isMounted) return
      clientLogger.error('🔴 Server error:', data)

      // Show user-friendly error message
      if (data.translationKey) {
        showToast.error(data.translationKey)
      } else {
        showToast.error('errors.general', undefined, { message: data.message })
      }
    })

    // Helper to deduplicate events based on sequenceId
    const handleEventWithDeduplication = (eventName: string, data: any, handler: (data: any) => void) => {
      try {
        // Check for sequence ID to prevent duplicate processing
        if (data?.sequenceId !== undefined) {
          if (data.sequenceId <= lastProcessedSequenceRef.current) {
            clientLogger.warn(`⚠️ Dropped duplicate ${eventName} event`, {
              sequenceId: data.sequenceId,
              lastProcessed: lastProcessedSequenceRef.current
            })
            return
          }
          lastProcessedSequenceRef.current = data.sequenceId
        }

        handler(data)
      } catch (error) {
        clientLogger.error(`❌ Error handling ${eventName} event:`, error)
      }
    }

    // Register event handlers with error handling
    newSocket.on(SocketEvents.GAME_UPDATE, (data) =>
      handleEventWithDeduplication('game-update', data, onGameUpdateRef.current)
    )
    newSocket.on(SocketEvents.CHAT_MESSAGE, (data) =>
      handleEventWithDeduplication('chat-message', data, onChatMessageRef.current)
    )
    newSocket.on(SocketEvents.PLAYER_TYPING, (data) => onPlayerTypingRef.current(data))
    newSocket.on(SocketEvents.LOBBY_UPDATE, (data) =>
      handleEventWithDeduplication('lobby-update', data, onLobbyUpdateRef.current)
    )
    newSocket.on(SocketEvents.PLAYER_JOINED, (data) =>
      handleEventWithDeduplication('player-joined', data, onPlayerJoinedRef.current)
    )
    newSocket.on(SocketEvents.GAME_STARTED, (data) =>
      handleEventWithDeduplication('game-started', data, onGameStartedRef.current)
    )
    if (onGameAbandonedRef.current) {
      newSocket.on(SocketEvents.GAME_ABANDONED, (data) =>
        handleEventWithDeduplication('game-abandoned', data, onGameAbandonedRef.current!)
      )
    }
    if (onPlayerLeftRef.current) {
      newSocket.on(SocketEvents.PLAYER_LEFT, (data) =>
        handleEventWithDeduplication('player-left', data, onPlayerLeftRef.current!)
      )
    }
    if (onBotActionRef.current) {
      newSocket.on(SocketEvents.BOT_ACTION, (data) =>
        handleEventWithDeduplication('bot-action', data, onBotActionRef.current!)
      )
    }

    if (isMounted) {
      socketRef.current = newSocket
      setSocket(newSocket)
    }
    }

    // Initialize socket connection with authentication
    initAndConnect()

    return () => {
      isMounted = false
      clientLogger.log('🔌 Cleaning up socket connection')

      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      // Cleanup socket if exists
      const socketToCleanup = socketRef.current
      socketRef.current = null
      if (socketToCleanup) {
        // Remove all listeners first
        socketToCleanup.off(SocketEvents.CONNECT)
        socketToCleanup.off(SocketEvents.DISCONNECT)
        socketToCleanup.off(SocketEvents.CONNECT_ERROR)
        socketToCleanup.off(SocketEvents.RECONNECT_ATTEMPT)
        socketToCleanup.off(SocketEvents.RECONNECT_FAILED)
        socketToCleanup.off(SocketEvents.RECONNECT)
        socketToCleanup.off(SocketEvents.ERROR)
        socketToCleanup.off(SocketEvents.SERVER_ERROR)
        socketToCleanup.off(SocketEvents.GAME_UPDATE)
        socketToCleanup.off(SocketEvents.CHAT_MESSAGE)
        socketToCleanup.off(SocketEvents.PLAYER_TYPING)
        socketToCleanup.off(SocketEvents.LOBBY_UPDATE)
        socketToCleanup.off(SocketEvents.PLAYER_JOINED)
        socketToCleanup.off(SocketEvents.GAME_STARTED)
        socketToCleanup.off(SocketEvents.GAME_ABANDONED)
        socketToCleanup.off(SocketEvents.PLAYER_LEFT)
        socketToCleanup.off(SocketEvents.BOT_ACTION)

        // Gracefully disconnect only if connected
        if (socketToCleanup.connected) {
          socketToCleanup.disconnect()
        } else if (typeof socketToCleanup.close === 'function') {
          // Force close if not connected yet (prevents WebSocket error)
          socketToCleanup.close()
        }
      }
    }
    // session?.user?.id is accessed directly in the effect, no need to add session itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isGuest, guestId, guestName, guestToken, session?.user?.id])

  const emitWhenConnected = useCallback((event: string, data: any) => {
    const currentSocket = socketRef.current
    if (!currentSocket) return

    if (isConnected) {
      currentSocket.emit(event, data)
    } else {
      currentSocket.once('connect', () => {
        currentSocket.emit(event, data)
      })
    }
  }, [isConnected])

  return {
    socket,
    isConnected,
    isReconnecting,
    reconnectAttempt,
    emitWhenConnected
  }
}
