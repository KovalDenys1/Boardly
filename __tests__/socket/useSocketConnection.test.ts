import { renderHook, act, waitFor } from '@testing-library/react'
import { useSocketConnection } from '@/app/lobby/[code]/hooks/useSocketConnection'

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

const originalFetch = global.fetch
const mockFetch = jest.fn()

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

  const getHandler = <T extends (...args: any[]) => void>(event: string): T | undefined =>
    mockSocket.on.mock.calls.find((call: any[]) => call[0] === event)?.[1] as T | undefined

  const waitForSocketInit = async () => {
    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function))
    })
  }

  const flushAsync = async (ms: number = 20) => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, ms))
    })
  }

  beforeAll(() => {
    ;(global as any).fetch = mockFetch
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ token: 'test.socket.jwt' }),
    })

    mockSocket.connected = true
    mockSocket.on.mockClear()
    mockSocket.off.mockClear()
    mockSocket.emit.mockClear()
    mockSocket.once.mockClear()
    mockSocket.disconnect.mockClear()
    mockSocket.close.mockClear()
  })

  afterAll(() => {
    ;(global as any).fetch = originalFetch
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

    it('should connect for guest users with valid guest token', async () => {
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

      await waitFor(() => {
        expect(result.current.socket).toBeDefined()
      })

      expect(result.current.isConnected).toBe(false) // Not connected until 'connect' event fires
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should create socket for authenticated users with valid session', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))

      await waitFor(() => {
        expect(result.current.socket).toBeDefined()
      })

      expect(result.current.isConnected).toBe(false) // Not connected until 'connect' event fires
      expect(mockFetch).toHaveBeenCalledWith('/api/socket/token')
    })
  })

  describe('Connection State', () => {
    it('should track connection state correctly', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      expect(result.current.isConnected).toBe(false)

      const connectHandler = getHandler<() => void>('connect')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      expect(result.current.isConnected).toBe(true)
    })

    it('should handle disconnect correctly', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      const connectHandler = getHandler<() => void>('connect')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      expect(result.current.isConnected).toBe(true)

      const disconnectHandler = getHandler<(reason: string) => void>('disconnect')

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

      await waitForSocketInit()
      await flushAsync(10)

      const gameUpdateHandler = getHandler<(data: any) => void>('game-update')
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

      await waitForSocketInit()
      await flushAsync(10)

      const chatHandler = getHandler<(data: any) => void>('chat-message')
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

      await waitForSocketInit()
      await flushAsync(10)

      const botActionHandler = getHandler<(data: any) => void>('bot-action')
      const botData = { type: 'roll', botId: 'bot-1' }

      await act(async () => {
        botActionHandler?.(botData)
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onBotAction).toHaveBeenCalledWith(botData)
    })

    it('should accept lower sequence ids after reconnect (server restart scenario)', async () => {
      const onGameUpdate = jest.fn()
      renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          onGameUpdate,
        })
      )

      await waitForSocketInit()
      await flushAsync(10)

      const connectHandler = getHandler<() => void>('connect')
      const gameUpdateHandler = getHandler<(data: any) => void>('game-update')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        gameUpdateHandler?.({ sequenceId: 10, payload: { state: { id: 's1' } } })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onGameUpdate).toHaveBeenCalledTimes(1)

      // Simulate reconnect after server restart: sequence counter may start from 1 again.
      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        gameUpdateHandler?.({ sequenceId: 1, payload: { state: { id: 's2' } } })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onGameUpdate).toHaveBeenCalledTimes(2)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup active socket on unmount without requiring rerender', async () => {
      mockSocket.connected = true

      const { result, unmount } = renderHook(() => useSocketConnection(defaultProps))

      await waitFor(() => {
        expect(result.current.socket).toBeDefined()
      })

      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should disconnect when unmounting if connected', async () => {
      mockSocket.connected = true

      const { result, rerender, unmount } = renderHook(
        (props) => useSocketConnection(props),
        { initialProps: defaultProps }
      )

      await waitFor(() => {
        expect(result.current.socket).toBeDefined()
      })

      // Trigger effect cleanup cycle that captures initialized socket instance
      rerender({ ...defaultProps, code: 'DEF456' })
      unmount()

      expect(mockSocket.disconnect).toHaveBeenCalled()
    })

    it('should close when unmounting if not connected', async () => {
      mockSocket.connected = false

      const { result, rerender, unmount } = renderHook(
        (props) => useSocketConnection(props),
        { initialProps: defaultProps }
      )

      await waitFor(() => {
        expect(result.current.socket).toBeDefined()
      })

      rerender({ ...defaultProps, code: 'DEF456' })
      unmount()

      expect(mockSocket.close).toHaveBeenCalled()
    })

    it('should remove all event listeners on unmount', async () => {
      const { result, rerender, unmount } = renderHook(
        (props) => useSocketConnection(props),
        { initialProps: defaultProps }
      )

      await waitFor(() => {
        expect(result.current.socket).toBeDefined()
      })

      rerender({ ...defaultProps, code: 'DEF456' })
      unmount()

      expect(mockSocket.off).toHaveBeenCalled()
      expect(mockSocket.off.mock.calls.length).toBeGreaterThan(5)
    })
  })

  describe('emitWhenConnected helper', () => {
    it('should emit immediately when already connected', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      const connectHandler = getHandler<() => void>('connect')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })

      expect(result.current.isConnected).toBe(true)

      mockSocket.emit.mockClear()

      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' })
    })

    it('should queue event when not connected', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      expect(result.current.isConnected).toBe(false)

      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      expect(mockSocket.once).toHaveBeenCalledWith('connect', expect.any(Function))
    })
  })
})
