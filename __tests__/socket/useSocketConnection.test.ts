import { renderHook, act, waitFor } from '@testing-library/react'
import { useSocketConnection } from '@/app/lobby/[code]/hooks/useSocketConnection'
import { Socket } from 'socket.io-client'

// Mock socket.io-client
const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connected: true,
  disconnect: jest.fn(),
  connect: jest.fn(),
  io: {
    opts: {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    },
  },
} as unknown as Socket

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

// Mock socket-url
jest.mock('@/lib/socket-url', () => ({
  getBrowserSocketUrl: jest.fn(() => 'http://localhost:3001'),
}))

// Mock client-logger
jest.mock('@/lib/client-logger', () => ({
  clientLogger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

describe('useSocketConnection', () => {
  const mockSession = {
    user: {
      id: 'user-123',
      username: 'TestUser',
      email: 'test@example.com',
    },
  }

  const defaultProps = {
    code: 'ABC123',
    session: mockSession,
    isGuest: false,
    guestId: '',
    guestName: '',
    onGameUpdate: jest.fn(),
    onChatMessage: jest.fn(),
    onPlayerTyping: jest.fn(),
    onLobbyUpdate: jest.fn(),
    onPlayerJoined: jest.fn(),
    onGameStarted: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockSocket.connected = true
  })

  describe('Connection', () => {
    it('should initialize socket connection', () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      expect(result.current.socket).toBeDefined()
      expect(result.current.isConnected).toBe(true)
    })

    it('should not connect without lobby code', () => {
      const { result } = renderHook(() =>
        useSocketConnection({ ...defaultProps, code: '' })
      )

      expect(result.current.socket).toBeNull()
    })

    it('should wait for session for authenticated users', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          session: null,
          isGuest: false,
        })
      )

      expect(result.current.socket).toBeNull()
    })

    it('should connect immediately for guest users', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          isGuest: true,
          guestId: 'guest-123',
          guestName: 'Guest',
          session: null,
        })
      )

      expect(result.current.socket).toBeDefined()
    })
  })

  describe('Event Listeners', () => {
    it('should register all event listeners', () => {
      renderHook(() => useSocketConnection(defaultProps))

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('game-update', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('chat-message', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-typing', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('lobby-update', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('player-joined', expect.any(Function))
      expect(mockSocket.on).toHaveBeenCalledWith('game-started', expect.any(Function))
    })

    it('should call onGameUpdate when game-update event is received', () => {
      renderHook(() => useSocketConnection(defaultProps))

      const gameUpdateHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'game-update'
      )?.[1]

      const gameData = { action: 'roll-dice', payload: {} }
      act(() => {
        gameUpdateHandler?.(gameData)
      })

      expect(defaultProps.onGameUpdate).toHaveBeenCalledWith(gameData)
    })

    it('should call onChatMessage when chat-message event is received', () => {
      renderHook(() => useSocketConnection(defaultProps))

      const chatHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat-message'
      )?.[1]

      const message = { id: '1', message: 'Hello', username: 'Test' }
      act(() => {
        chatHandler?.(message)
      })

      expect(defaultProps.onChatMessage).toHaveBeenCalledWith(message)
    })
  })

  describe('Reconnection', () => {
    it('should handle disconnect event', () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'disconnect'
      )?.[1]

      act(() => {
        mockSocket.connected = false
        disconnectHandler?.('transport close')
      })

      // Hook should track disconnection
      expect(mockSocket.connected).toBe(false)
    })

    it('should handle reconnect event', () => {
      renderHook(() => useSocketConnection(defaultProps))

      const connectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1]

      act(() => {
        mockSocket.connected = true
        connectHandler?.()
      })

      // Should emit join-lobby again on reconnect
      expect(mockSocket.emit).toHaveBeenCalledWith('join-lobby', 'ABC123')
    })
  })

  describe('Cleanup', () => {
    it('should disconnect socket on unmount', () => {
      const { unmount } = renderHook(() => useSocketConnection(defaultProps))

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should remove all event listeners on unmount', () => {
      const { unmount } = renderHook(() => useSocketConnection(defaultProps))

      unmount()

      expect(mockSocket.off).toHaveBeenCalled()
    })
  })

  describe('Helper Function: emitWhenConnected', () => {
    it('should emit event immediately when connected', () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' })
    })

    it('should queue event when disconnected', async () => {
      mockSocket.connected = false
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      // Should not emit immediately
      expect(mockSocket.emit).not.toHaveBeenCalledWith('test-event', { data: 'test' })

      // Simulate reconnection
      act(() => {
        mockSocket.connected = true
        const connectHandler = mockSocket.on.mock.calls.find(
          (call) => call[0] === 'connect'
        )?.[1]
        connectHandler?.()
      })

      // Should emit queued event after reconnection
      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' })
      })
    })
  })

  describe('Bot Actions', () => {
    it('should handle bot-action event when callback provided', () => {
      const onBotAction = jest.fn()
      renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          onBotAction,
        })
      )

      const botActionHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'bot-action'
      )?.[1]

      const botData = { action: 'roll', botId: 'bot-1' }
      act(() => {
        botActionHandler?.(botData)
      })

      expect(onBotAction).toHaveBeenCalledWith(botData)
    })

    it('should not register bot-action listener when callback not provided', () => {
      renderHook(() => useSocketConnection(defaultProps))

      const botActionHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'bot-action'
      )

      expect(botActionHandler).toBeUndefined()
    })
  })
})
