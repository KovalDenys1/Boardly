import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { SocketEvents, ServerErrorPayload } from '@/types/socket-events'
import { showToast } from '@/lib/i18n-toast'
import {
  trackLobbyJoinAckTimeout,
  trackLobbyJoinRetry,
  trackSocketAuthRefreshFailed,
  trackSocketReconnectAttempt,
  trackSocketReconnectFailedFinal,
  trackSocketReconnectRecovered,
} from '@/lib/analytics'

const INITIAL_GUEST_JOIN_DELAY_MS = 500
const JOIN_ACK_TIMEOUT_MS = 4000
const MAX_JOIN_ATTEMPTS = 4
const AUTH_FAILURE_RESET_MS = 5000
const MAX_PENDING_EMITS = 50

interface UseSocketConnectionProps {
  code: string
  session: any
  isGuest: boolean
  guestId: string | null
  guestName: string | null
  guestToken: string | null
  /**
   * Connect and join lobby room only after user is confirmed as a lobby member.
   * Prevents transient "access denied" errors before HTTP join completes.
   */
  shouldJoinLobbyRoom?: boolean
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
}: UseSocketConnectionProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const hasConnectedOnceRef = useRef(false)
  const authFailedRef = useRef(false)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const joinRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const joinAckTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastProcessedSequenceRef = useRef(0)
  const isRejoiningRef = useRef(false)
  const hasJoinedLobbyRef = useRef(false)
  const shouldSyncAfterJoinRef = useRef(false)
  const joinAttemptRef = useRef(0)
  const reconnectAttemptRef = useRef(0)
  const reconnectStartedAtRef = useRef<number | null>(null)
  const reconnectAttemptsForCycleRef = useRef(0)
  const latestAuthTokenRef = useRef<string | null>(null)
  const authTokenUnauthorizedRef = useRef(false)
  const authFailureCountRef = useRef(0)
  const connectionRunIdRef = useRef(0)
  const hasTrackedFinalFailureRef = useRef(false)
  const pendingEmitQueueRef = useRef<Array<{ event: string; data: any }>>([])

  const flushPendingEmits = useCallback(() => {
    const currentSocket = socketRef.current
    if (!currentSocket || !currentSocket.connected || !hasJoinedLobbyRef.current) {
      return
    }

    if (pendingEmitQueueRef.current.length === 0) {
      return
    }

    const queued = pendingEmitQueueRef.current.splice(0, pendingEmitQueueRef.current.length)
    for (const entry of queued) {
      currentSocket.emit(entry.event, entry.data)
    }
  }, [])

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

  const normalizeServerError = useCallback((data: unknown): ServerErrorPayload | null => {
    if (!data || typeof data !== 'object') {
      return null
    }

    const payload = data as Partial<ServerErrorPayload>
    const code = typeof payload.code === 'string' ? payload.code : ''
    const message = typeof payload.message === 'string' ? payload.message : ''
    const translationKey =
      typeof payload.translationKey === 'string' ? payload.translationKey : undefined
    const details = payload.details && typeof payload.details === 'object' ? payload.details : undefined
    const stack = typeof payload.stack === 'string' ? payload.stack : undefined

    if (!code && !message && !translationKey) {
      return null
    }

    return {
      code: code || 'UNKNOWN_SOCKET_ERROR',
      message: message || 'Unknown server error',
      translationKey,
      details,
      stack,
    }
  }, [])

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
  }, [
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
  ])

  useEffect(() => {
    let isMounted = true
    const runId = ++connectionRunIdRef.current

    const trackFinalReconnectFailureOnce = (event: {
      attemptsTotal: number
      reason: 'reconnect_failed' | 'authentication_failed' | 'rejoin_timeout'
      isGuest: boolean
    }) => {
      if (hasTrackedFinalFailureRef.current) {
        return
      }
      hasTrackedFinalFailureRef.current = true
      trackSocketReconnectFailedFinal(event)
    }

    const clearTimer = (timerRef: { current: NodeJS.Timeout | null }) => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    clearTimer(reconnectTimeoutRef)
    clearTimer(joinRetryTimeoutRef)
    clearTimer(joinAckTimeoutRef)

    if (!code) {
      clientLogger.warn('⚠️ No lobby code provided, skipping socket connection')
      return
    }

    if (!shouldJoinLobbyRoom) {
      clientLogger.log('⏳ Waiting for lobby membership before joining socket room...')
      setIsConnected(false)
      setIsReconnecting(false)
      return
    }

    if (isGuest && !guestToken) {
      clientLogger.log('⏳ Waiting for guest token before connecting socket...')
      authFailedRef.current = false
      return
    }

    if (!isGuest && !session?.user?.id) {
      clientLogger.log('⏳ Waiting for session to load before connecting socket...', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
      })
      authFailedRef.current = false
      return
    }

    if (!isGuest && session?.user?.id) {
      const userId = session.user.id
      if (typeof userId !== 'string' || userId.length < 10) {
        clientLogger.error('❌ Invalid user ID format in session:', {
          userId,
          userIdType: typeof userId,
          userIdLength: userId ? String(userId).length : 0,
        })
        authFailedRef.current = true
        showToast.error('errors.authenticationFailed')
        return
      }
    }

    if (authFailedRef.current) {
      clientLogger.warn('⚠️ Skipping socket connection - authentication previously failed')
      return
    }

    const url = getBrowserSocketUrl()
    clientLogger.log('🔌 Initializing socket connection', {
      url,
      code,
      isGuest,
      userId: !isGuest ? session?.user?.id : guestId,
    })

    const getAuthToken = async (): Promise<string | null> => {
      if (isGuest && guestToken) {
        authTokenUnauthorizedRef.current = false
        latestAuthTokenRef.current = guestToken

        clientLogger.log('🔐 Using guest authentication token', {
          guestId,
          guestName,
          hasToken: true,
        })
        return guestToken
      }

      if (!isGuest && session?.user?.id) {
        let responseStatus: number | undefined
        try {
          clientLogger.log('🔐 Fetching Socket.IO token for authenticated user...')
          const response = await fetch('/api/socket/token')
          if (!response.ok) {
            responseStatus = response.status
            if (response.status === 401 || response.status === 403) {
              authTokenUnauthorizedRef.current = true
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const data = (await response.json()) as { token?: string }
          if (!data.token) {
            throw new Error('No token in response')
          }

          authTokenUnauthorizedRef.current = false
          latestAuthTokenRef.current = data.token
          clientLogger.log('✅ Socket.IO token fetched successfully')
          return data.token
        } catch (error) {
          trackSocketAuthRefreshFailed({
            stage: 'token_fetch',
            status: responseStatus,
            isGuest: false,
          })
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

      const calculateBackoff = (attempt: number) => {
        const baseDelay = 1000
        const maxDelay = 30000
        return Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
      }

      const queryPayload: Record<string, string> = {}
      if (isGuest) {
        queryPayload.isGuest = 'true'
      }

      const resolveAuthPayload = async (): Promise<Record<string, unknown>> => {
        if (isGuest) {
          const payload: Record<string, unknown> = { isGuest: true }
          if (guestToken) {
            latestAuthTokenRef.current = guestToken
            payload.token = guestToken
          }
          return payload
        }

        const refreshedToken = await getAuthToken()
        if (refreshedToken) {
          return { token: refreshedToken }
        }

        if (latestAuthTokenRef.current) {
          clientLogger.warn('⚠️ Using cached socket auth token after refresh failure')
          return { token: latestAuthTokenRef.current }
        }

        return {}
      }

      return { queryPayload, calculateBackoff, resolveAuthPayload }
    }

    const initAndConnect = async () => {
      const authData = await initSocket()
      if (!authData || !isMounted || runId !== connectionRunIdRef.current) {
        return
      }

      const { queryPayload, calculateBackoff, resolveAuthPayload } = authData

      const newSocket = io(url, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionAttempts: 20,
        reconnectionDelay: 3000,
        reconnectionDelayMax: 120000,
        timeout: 180000,
        upgrade: true,
        rememberUpgrade: true,
        autoConnect: true,
        forceNew: false,
        multiplex: true,
        path: '/socket.io/',
        closeOnBeforeunload: false,
        withCredentials: true,
        auth: (callback) => {
          void resolveAuthPayload()
            .then((payload) => {
              callback(payload)
            })
            .catch((error) => {
              trackSocketAuthRefreshFailed({
                stage: 'socket_auth_payload',
                isGuest,
              })
              clientLogger.error('❌ Failed to resolve socket auth payload:', error)
              if (!isGuest && latestAuthTokenRef.current) {
                callback({ token: latestAuthTokenRef.current })
                return
              }
              if (isGuest) {
                callback({
                  isGuest: true,
                  ...(guestToken ? { token: guestToken } : {}),
                })
                return
              }
              callback({})
            })
        },
        query: queryPayload,
      })

      if (!isMounted || runId !== connectionRunIdRef.current) {
        if (typeof newSocket.close === 'function') {
          newSocket.close()
        } else {
          newSocket.disconnect()
        }
        return
      }

      const clearJoinTimers = () => {
        if (joinRetryTimeoutRef.current) {
          clearTimeout(joinRetryTimeoutRef.current)
          joinRetryTimeoutRef.current = null
        }
        if (joinAckTimeoutRef.current) {
          clearTimeout(joinAckTimeoutRef.current)
          joinAckTimeoutRef.current = null
        }
      }

      const syncStateAfterReconnect = async () => {
        if (!shouldSyncAfterJoinRef.current || !onStateSyncRef.current) {
          return
        }

        shouldSyncAfterJoinRef.current = false

        try {
          clientLogger.log('🔄 Syncing state after reconnect...')
          await onStateSyncRef.current()
          clientLogger.log('✅ State synced successfully')
        } catch (error) {
          clientLogger.error('❌ Failed to sync state after reconnect:', error)
        }
      }

      function scheduleJoinRetry(trigger: string, delayMs: number) {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        if (joinRetryTimeoutRef.current) {
          clearTimeout(joinRetryTimeoutRef.current)
        }

        trackLobbyJoinRetry({
          attempt: joinAttemptRef.current,
          delayMs,
          trigger,
          isGuest,
        })

        joinRetryTimeoutRef.current = setTimeout(() => {
          joinRetryTimeoutRef.current = null
          attemptLobbyJoin(trigger)
        }, delayMs)
      }

      function attemptLobbyJoin(trigger: string) {
        if (!isMounted || runId !== connectionRunIdRef.current) return
        if (!newSocket.connected) return
        if (hasJoinedLobbyRef.current) return
        if (isRejoiningRef.current) return

        isRejoiningRef.current = true
        joinAttemptRef.current += 1
        const attempt = joinAttemptRef.current

        clientLogger.log('📡 Joining lobby socket room', {
          lobbyCode: code,
          attempt,
          trigger,
        })
        newSocket.emit(SocketEvents.JOIN_LOBBY, code)

        if (joinAckTimeoutRef.current) {
          clearTimeout(joinAckTimeoutRef.current)
        }

        joinAckTimeoutRef.current = setTimeout(() => {
          joinAckTimeoutRef.current = null
          isRejoiningRef.current = false

          if (!isMounted || runId !== connectionRunIdRef.current || !newSocket.connected) return
          if (hasJoinedLobbyRef.current) return

          trackLobbyJoinAckTimeout({
            attempt,
            isGuest,
          })

          if (attempt >= MAX_JOIN_ATTEMPTS) {
            clientLogger.error('❌ Lobby join confirmation timeout after max retries', {
              lobbyCode: code,
              maxAttempts: MAX_JOIN_ATTEMPTS,
            })
            trackFinalReconnectFailureOnce({
              attemptsTotal: Math.max(reconnectAttemptsForCycleRef.current, attempt),
              reason: 'rejoin_timeout',
              isGuest,
            })
            showToast.error('errors.connectionFailed')
            return
          }

          const retryDelayMs = Math.min(500 * Math.pow(2, attempt - 1), 4000)
          clientLogger.warn('⚠️ Lobby join confirmation timeout, scheduling retry', {
            lobbyCode: code,
            attempt,
            retryDelayMs,
          })
          scheduleJoinRetry('join-ack-timeout', retryDelayMs)
        }, JOIN_ACK_TIMEOUT_MS)
      }

      newSocket.on(SocketEvents.JOINED_LOBBY, (payload?: { lobbyCode?: string; success?: boolean }) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return
        if (payload?.lobbyCode && payload.lobbyCode !== code) return

        clearJoinTimers()
        isRejoiningRef.current = false
        joinAttemptRef.current = 0

        if (hasJoinedLobbyRef.current) {
          return
        }

        hasJoinedLobbyRef.current = true
        clientLogger.log('✅ Lobby join confirmed by server', {
          lobbyCode: code,
          success: payload?.success ?? true,
        })

        if (shouldSyncAfterJoinRef.current && reconnectStartedAtRef.current) {
          trackSocketReconnectRecovered({
            attemptsTotal: Math.max(1, reconnectAttemptsForCycleRef.current),
            timeToRecoverMs: Math.max(0, Date.now() - reconnectStartedAtRef.current),
            isGuest,
          })
          reconnectStartedAtRef.current = null
          reconnectAttemptsForCycleRef.current = 0
        }

        flushPendingEmits()
        void syncStateAfterReconnect()
      })

      newSocket.on('connect', () => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        const isReconnect = hasConnectedOnceRef.current
        clientLogger.log(
          isReconnect ? '🔄 Socket reconnected to lobby:' : '✅ Socket connected to lobby:',
          code
        )

        // Reset dedup cursor on each fresh transport session.
        // Server sequence counters are in-memory and can reset on restart/redeploy.
        lastProcessedSequenceRef.current = 0

        setIsConnected(true)
        setIsReconnecting(false)
        setReconnectAttempt(0)
        hasTrackedFinalFailureRef.current = false
        if (!isReconnect) {
          reconnectAttemptRef.current = 0
          reconnectAttemptsForCycleRef.current = 0
          reconnectStartedAtRef.current = null
        }
        authFailureCountRef.current = 0
        authTokenUnauthorizedRef.current = false
        hasJoinedLobbyRef.current = false
        shouldSyncAfterJoinRef.current = isReconnect
        isRejoiningRef.current = false
        joinAttemptRef.current = 0
        clearJoinTimers()

        const joinDelayMs = isGuest && !isReconnect ? INITIAL_GUEST_JOIN_DELAY_MS : 0
        if (joinDelayMs > 0) {
          clientLogger.log('⏳ Guest first connect - waiting before lobby join confirmation flow...')
          scheduleJoinRetry('guest-initial-delay', joinDelayMs)
        } else {
          attemptLobbyJoin(isReconnect ? 'reconnect' : 'connect')
        }

        hasConnectedOnceRef.current = true
      })

      newSocket.on('disconnect', (reason) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        setIsConnected(false)
        hasJoinedLobbyRef.current = false
        pendingEmitQueueRef.current = []
        shouldSyncAfterJoinRef.current = false
        isRejoiningRef.current = false
        clearJoinTimers()

        if (reason !== 'io client disconnect' && hasConnectedOnceRef.current) {
          clientLogger.log('❌ Socket disconnected:', reason)
          reconnectStartedAtRef.current = Date.now()
          reconnectAttemptsForCycleRef.current = 0
          hasTrackedFinalFailureRef.current = false
          setIsReconnecting(true)
        } else {
          reconnectStartedAtRef.current = null
          reconnectAttemptsForCycleRef.current = 0
        }
      })

      newSocket.on('reconnect_attempt', (attempt) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        reconnectAttemptRef.current = attempt
        reconnectAttemptsForCycleRef.current = attempt
        setReconnectAttempt(attempt)
        const backoff = calculateBackoff(attempt - 1)
        const transport =
          (newSocket as unknown as { io?: { engine?: { transport?: { name?: unknown } } } }).io?.engine
            ?.transport?.name

        trackSocketReconnectAttempt({
          attempt,
          backoffMs: backoff,
          isGuest,
          transport: typeof transport === 'string' ? transport : undefined,
          reason: 'reconnect_attempt',
        })

        clientLogger.log(`🔄 Reconnection attempt #${attempt} (waiting ${backoff}ms)`)
      })

      newSocket.on('reconnect_failed', () => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        trackFinalReconnectFailureOnce({
          attemptsTotal: Math.max(1, reconnectAttemptsForCycleRef.current),
          reason: 'reconnect_failed',
          isGuest,
        })

        clientLogger.error('❌ Failed to reconnect after maximum attempts')
        setIsReconnecting(false)
        reconnectStartedAtRef.current = null
        reconnectAttemptsForCycleRef.current = 0
      })

      newSocket.on('reconnect', (attempt) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        clientLogger.log(`✅ Reconnected successfully after ${attempt} attempts`)
        setIsReconnecting(false)
        setReconnectAttempt(0)
        reconnectAttemptRef.current = 0
      })

      newSocket.on('connect_error', (error: Error & { type?: string; description?: string }) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        const errorMsg = error.message || String(error)
        const activeToken = latestAuthTokenRef.current
        const currentAttempt = reconnectAttemptRef.current

        clientLogger.error('🔴 Socket connection error:', errorMsg, {
          isGuest,
          hasToken: !!activeToken,
          tokenPreview: activeToken ? String(activeToken).substring(0, 10) + '...' : 'none',
          reconnectAttempt: currentAttempt,
          errorType: error.type,
          errorDescription: error.description,
        })

        setIsConnected(false)

        if (errorMsg.includes('timeout')) {
          clientLogger.warn('⏳ Socket connection timeout - retrying...')
          if (currentAttempt > 3) {
            showToast.error('errors.connectionTimeout')
          }
          return
        }

        if (errorMsg.includes('xhr poll error')) {
          clientLogger.warn('⚠️ XHR poll error detected', {
            attempt: currentAttempt,
            hasToken: !!activeToken,
            isGuest,
            message: 'This usually means the server is unreachable or authentication failed',
          })

          if (!isGuest && currentAttempt === 0) {
            clientLogger.log('🔍 First poll error for authenticated user - checking token:', {
              tokenType: typeof activeToken,
              tokenValue: activeToken,
              sessionExists: !!session,
              userIdInSession: session?.user?.id,
            })
          }

          if (currentAttempt > 3) {
            showToast.error('errors.connectionFailed')
          }
          return
        }

        if (errorMsg.includes('Authentication failed') || errorMsg.includes('Authentication required')) {
          authFailureCountRef.current += 1

          const shouldStopRetrying =
            isGuest || authTokenUnauthorizedRef.current || authFailureCountRef.current >= 3

          if (!shouldStopRetrying) {
            clientLogger.warn('⚠️ Socket authentication handshake failed, retrying with refreshed token', {
              authFailureCount: authFailureCountRef.current,
              reconnectAttempt: currentAttempt,
            })
            return
          }

          clientLogger.error('🔐 Authentication failed - stopping reconnection attempts', {
            isGuest,
            unauthorizedFromTokenEndpoint: authTokenUnauthorizedRef.current,
            authFailureCount: authFailureCountRef.current,
          })

          trackFinalReconnectFailureOnce({
            attemptsTotal: Math.max(1, reconnectAttemptsForCycleRef.current),
            reason: 'authentication_failed',
            isGuest,
          })

          authFailedRef.current = true
          setIsReconnecting(false)
          showToast.error('errors.authenticationFailed')

          newSocket.removeAllListeners()
          newSocket.close()

          reconnectTimeoutRef.current = setTimeout(() => {
            clientLogger.log('🔄 Resetting authentication flag - retry allowed')
            authFailedRef.current = false
            authFailureCountRef.current = 0
            authTokenUnauthorizedRef.current = false
          }, AUTH_FAILURE_RESET_MS)
          return
        }

        clientLogger.error('❌ Socket error:', error.message)
        if (currentAttempt > 5) {
          showToast.error('errors.connectionError')
        }
      })

      newSocket.on(SocketEvents.ERROR, (error) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return
        clientLogger.error('🔴 Socket error:', error)
      })

      newSocket.on(SocketEvents.SERVER_ERROR, (data: ServerErrorPayload) => {
        if (!isMounted || runId !== connectionRunIdRef.current) return

        const normalizedError = normalizeServerError(data)
        if (!normalizedError) {
          clientLogger.warn('⚠️ Received malformed server error payload, ignoring:', data)
          return
        }

        if (normalizedError.code === 'LOBBY_ACCESS_DENIED') {
          if (!hasJoinedLobbyRef.current && newSocket.connected) {
            clientLogger.warn('⚠️ Lobby access denied before join confirmation - retrying join', {
              lobbyCode: code,
              isGuest,
            })
            isRejoiningRef.current = false
            scheduleJoinRetry('access-denied', 1000)
            return
          }

          if (isGuest) {
            clientLogger.warn('⚠️ Guest lobby access denied after connect - requesting state sync', {
              lobbyCode: code,
            })
            if (onStateSyncRef.current) {
              void onStateSyncRef.current().catch((syncError) => {
                clientLogger.warn('⚠️ Guest state sync after access denied failed:', syncError)
              })
            }
            return
          }
        }

        clientLogger.error('🔴 Server error:', normalizedError)

        if (normalizedError.translationKey) {
          showToast.error(normalizedError.translationKey)
        } else {
          showToast.error('errors.general', undefined, { message: normalizedError.message })
        }
      })

      const handleEventWithDeduplication = (
        eventName: string,
        data: any,
        handler: (payload: any) => void
      ) => {
        try {
          if (data?.sequenceId !== undefined) {
            if (data.sequenceId <= lastProcessedSequenceRef.current) {
              clientLogger.warn(`⚠️ Dropped duplicate ${eventName} event`, {
                sequenceId: data.sequenceId,
                lastProcessed: lastProcessedSequenceRef.current,
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

    initAndConnect()

    return () => {
      isMounted = false
      connectionRunIdRef.current += 1
      clientLogger.log('🔌 Cleaning up socket connection')

      clearTimer(reconnectTimeoutRef)
      clearTimer(joinRetryTimeoutRef)
      clearTimer(joinAckTimeoutRef)

      const socketToCleanup = socketRef.current
      socketRef.current = null
      if (socketToCleanup) {
        socketToCleanup.off(SocketEvents.CONNECT)
        socketToCleanup.off(SocketEvents.DISCONNECT)
        socketToCleanup.off(SocketEvents.JOINED_LOBBY)
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

        if (socketToCleanup.connected) {
          socketToCleanup.disconnect()
        } else if (typeof socketToCleanup.close === 'function') {
          socketToCleanup.close()
        }
      }

      reconnectAttemptRef.current = 0
      reconnectStartedAtRef.current = null
      reconnectAttemptsForCycleRef.current = 0
      authFailureCountRef.current = 0
      hasJoinedLobbyRef.current = false
      pendingEmitQueueRef.current = []
      shouldSyncAfterJoinRef.current = false
      joinAttemptRef.current = 0
      isRejoiningRef.current = false
      latestAuthTokenRef.current = null
      authTokenUnauthorizedRef.current = false
      hasTrackedFinalFailureRef.current = false
    }
    // session?.user?.id is accessed directly in the effect, no need to add session itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isGuest, guestId, guestName, guestToken, shouldJoinLobbyRoom, session?.user?.id, normalizeServerError, flushPendingEmits])

  const emitWhenConnected = useCallback(
    (event: string, data: any) => {
      const currentSocket = socketRef.current
      if (!currentSocket) return

      if (currentSocket.connected && hasJoinedLobbyRef.current) {
        currentSocket.emit(event, data)
        return
      }

      if (pendingEmitQueueRef.current.length >= MAX_PENDING_EMITS) {
        pendingEmitQueueRef.current.shift()
        clientLogger.warn('⚠️ Pending socket emit queue is full, dropping oldest event', {
          maxSize: MAX_PENDING_EMITS,
          lobbyCode: code,
        })
      }

      pendingEmitQueueRef.current.push({ event, data })
    },
    [code]
  )

  return {
    socket,
    isConnected,
    isReconnecting,
    reconnectAttempt,
    emitWhenConnected,
  }
}
