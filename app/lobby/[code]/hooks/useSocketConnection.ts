import { useEffect, useState, useCallback } from 'react'
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
}: UseSocketConnectionProps) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
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
    
    const newSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
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
      clientLogger.log('✅ Socket connected to lobby:', code)
      setIsConnected(true)
      
      // Join lobby room (server expects string, not object)
      newSocket.emit('join-lobby', code)
    })

    newSocket.on('disconnect', (reason) => {
      clientLogger.log('❌ Socket disconnected:', reason)
      setIsConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      clientLogger.error('Socket connection error:', error.message)
      setIsConnected(false)
      
      if (error.message.includes('timeout')) {
        clientLogger.warn('Socket connection timeout - retrying...')
      }
    })

    newSocket.on('game-update', onGameUpdate)
    newSocket.on('chat-message', onChatMessage)
    newSocket.on('player-typing', onPlayerTyping)
    newSocket.on('lobby-update', onLobbyUpdate)
    newSocket.on('player-joined', onPlayerJoined)
    newSocket.on('game-started', onGameStarted)

    setSocket(newSocket)

    return () => {
      clientLogger.log('🔌 Cleaning up socket connection')
      newSocket.off('connect')
      newSocket.off('disconnect')
      newSocket.off('connect_error')
      newSocket.off('game-update')
      newSocket.off('chat-message')
      newSocket.off('player-typing')
      newSocket.off('lobby-update')
      newSocket.off('player-joined')
      newSocket.off('game-started')
      newSocket.close()
    }
  }, [code, session?.user?.id, isGuest, guestId, guestName, onGameUpdate, onChatMessage, onPlayerTyping, onLobbyUpdate, onPlayerJoined, onGameStarted])

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

  return { socket, isConnected, emitWhenConnected }
}
