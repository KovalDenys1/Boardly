import { renderHook, act, waitFor } from '@testing-library/react'
import { useSocketConnection } from '@/app/lobby/[code]/hooks/useSocketConnection'
import { Socket } from 'socket.io-client'

// Mock socket.io-client
type MockSocket = {
  on: jest.Mock
  off: jest.Mock
  emit: jest.Mock
  once: jest.Mock
  connected: boolean
  disconnect: jest.Mock
  connect: jest.Mock
  close: jest.Mock
  io: {
    opts: {
      reconnection: boolean
      reconnectionAttempts: number
      reconnectionDelay: number
    }
  }
}

const mockSocket: MockSocket = {
  on: jest.fn((event, handler) => mockSocket),
  off: jest.fn(),
  emit: jest.fn(),
  once: jest.fn(),
  connected: true,
  disconnect: jest.fn(),
  connect: jest.fn(),
  close: jest.fn(),
  io: {
    opts: {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    },
  },
}

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

// Mock i18n-toast
jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))


describe('useSocketConnection', () => {
  const mockSession = {
    user: {
      id: 'clw8h9x1e0000v4qg7h8d2k3m', // Valid CUID format
      username: 'TestUser',
      email: 'test@example.com',
    },
  }

  const defaultProps = {
    code: 'ABC123',
    session: mockSession,
    isGuest: false,
    guestId: null,
    guestName: null,
    guestToken: null,
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
    mockSocket.on.mockClear()
    mockSocket.off.mockClear()
    mockSocket.emit.mockClear()
    mockSocket.once.mockClear()
    mockSocket.disconnect.mockClear()
    mockSocket.close.mockClear()
  })

  describe('Connection - Basic Validation', () => {
    it('should not connect without lobby code', () => {
      const { result } = renderHook(() =>
        useSocketConnection({ ...defaultProps, code: '' })
      )

      expect(result.current.socket).toBeNull()
      expect(result.current.isConnected).toBe(false)
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
      expect(result.current.isConnected).toBe(false)
    })

    it('should connect for guest users with valid guest token', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          isGuest: true,
          guestId: 'guest-123',
          guestName: 'Guest User',
          guestToken: 'guest.jwt.token',
          session: null,
        })
      )

      // Socket should be created for guest users
      expect(result.current.socket).toBeDefined()
      expect(result.current.isConnected).toBe(false) // Not connected until 'connect' event fires
    })

    it('should create socket for authenticated users with valid session', () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      // Socket should be created for authenticated users with valid session
      expect(result.current.socket).toBeDefined()
      expect(result.current.isConnected).toBe(false) // Not connected until 'connect' event fires
    })
  })

  describe('Connection State', () => {
    it('should track connection state correctly', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      // Initially not connected
      expect(result.current.isConnected).toBe(false)

      // Simulate connect event
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1] as (() => void) | undefined

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      // Should be connected now
      expect(result.current.isConnected).toBe(true)
    })

    it('should handle disconnect correctly', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      // First connect
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1] as (() => void) | undefined

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      expect(result.current.isConnected).toBe(true)

      // Then disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'disconnect'
      )?.[1] as ((reason: string) => void) | undefined

      await act(async () => {
        disconnectHandler?.('transport close')
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      expect(result.current.isConnected).toBe(false)
    })
  })

  describe('Event Handlers', () => {
    it('should call onGameUpdate when receiving game-update event', async () => {
      const onGameUpdate = jest.fn()
      renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          onGameUpdate,
        })
      )

      // Wait for refs to be set
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      const gameUpdateHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'game-update'
      )?.[1] as ((data: any) => void) | undefined

      const gameData = { type: 'roll', dice: [1, 2, 3, 4, 5] }

      await act(async () => {
        gameUpdateHandler?.(gameData)
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onGameUpdate).toHaveBeenCalledWith(gameData)
    })

    it('should call onChatMessage when receiving chat-message event', async () => {
      const onChatMessage = jest.fn()
      renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          onChatMessage,
        })
      )

      // Wait for refs to be set
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      const chatHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'chat-message'
      )?.[1] as ((data: any) => void) | undefined

      const message = { id: '1', message: 'Hello', username: 'TestUser' }

      await act(async () => {
        chatHandler?.(message)
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onChatMessage).toHaveBeenCalledWith(message)
    })

    it('should handle bot-action event when callback provided', async () => {
      const onBotAction = jest.fn()
      renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          onBotAction,
        })
      )

      // Wait for refs to be set
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      const botActionHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'bot-action'
      )?.[1] as ((data: any) => void) | undefined

      const botData = { type: 'roll', botId: 'bot-1' }

      await act(async () => {
        botActionHandler?.(botData)
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onBotAction).toHaveBeenCalledWith(botData)
    })
  })

  describe('Cleanup', () => {
    it('should disconnect when unmounting if connected', () => {
      mockSocket.connected = true
      const { unmount } = renderHook(() => useSocketConnection(defaultProps))

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should close when unmounting if not connected', () => {
      mockSocket.connected = false
      const { unmount } = renderHook(() => useSocketConnection(defaultProps))

      unmount()

      // Should call close() when not connected
      expect(mockSocket.close).toHaveBeenCalled()
    })

    it('should remove all event listeners on unmount', () => {
      const { unmount } = renderHook(() => useSocketConnection(defaultProps))

      unmount()

      // Should call off() for multiple events
      expect(mockSocket.off).toHaveBeenCalled()
      expect(mockSocket.off.mock.calls.length).toBeGreaterThan(5)
    })
  })

  describe('emitWhenConnected helper', () => {
    it('should emit immediately when already connected', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      // Connect first
      const connectHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'connect'
      )?.[1] as (() => void) | undefined

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      expect(result.current.isConnected).toBe(true)

      // Clear previous emits
      mockSocket.emit.mockClear()

      // Now emit
      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      // Should emit immediately since connected
      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' })
    })

    it('should queue event when not connected', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      // Not connected yet
      expect(result.current.isConnected).toBe(false)

      // Try to emit
      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      // Should use once() to queue the event
      expect(mockSocket.once).toHaveBeenCalledWith('connect', expect.any(Function))
    })
  })
})
