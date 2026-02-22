import { renderHook, act, waitFor } from '@testing-library/react'
import { useSocketConnection } from '@/app/lobby/[code]/hooks/useSocketConnection'

// Mock socket.io-client
type MockSocket = {
  on: jest.Mock
  off: jest.Mock
  emit: jest.Mock
  once: jest.Mock
  removeAllListeners: jest.Mock
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
  removeAllListeners: jest.fn(),
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

jest.mock('@/lib/analytics', () => ({
  trackLobbyJoinAckTimeout: jest.fn(),
  trackLobbyJoinRetry: jest.fn(),
  trackSocketAuthRefreshFailed: jest.fn(),
  trackSocketReconnectAttempt: jest.fn(),
  trackSocketReconnectFailedFinal: jest.fn(),
  trackSocketReconnectRecovered: jest.fn(),
}))

const analytics = jest.requireMock('@/lib/analytics') as {
  trackLobbyJoinAckTimeout: jest.Mock
  trackLobbyJoinRetry: jest.Mock
  trackSocketAuthRefreshFailed: jest.Mock
  trackSocketReconnectAttempt: jest.Mock
  trackSocketReconnectFailedFinal: jest.Mock
  trackSocketReconnectRecovered: jest.Mock
}

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
    mockSocket.removeAllListeners.mockClear()
    mockSocket.disconnect.mockClear()
    mockSocket.close.mockClear()
    analytics.trackLobbyJoinAckTimeout.mockClear()
    analytics.trackLobbyJoinRetry.mockClear()
    analytics.trackSocketAuthRefreshFailed.mockClear()
    analytics.trackSocketReconnectAttempt.mockClear()
    analytics.trackSocketReconnectFailedFinal.mockClear()
    analytics.trackSocketReconnectRecovered.mockClear()
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

    it('should defer socket connection until lobby membership is confirmed', () => {
      const { result } = renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          isGuest: true,
          guestId: 'guest-123',
          guestName: 'Guest User',
          guestToken: 'guest.jwt.token',
          session: null,
          shouldJoinLobbyRoom: false,
        })
      )

      expect(result.current.socket).toBeNull()
      expect(result.current.isConnected).toBe(false)
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

    it('should sync state only after lobby join confirmation on reconnect', async () => {
      const onStateSync = jest.fn().mockResolvedValue(undefined)
      renderHook(() =>
        useSocketConnection({
          ...defaultProps,
          onStateSync,
        })
      )

      await waitForSocketInit()

      const connectHandler = getHandler<() => void>('connect')
      const joinedLobbyHandler = getHandler<(payload: { lobbyCode: string; success: boolean }) => void>('joined-lobby')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await act(async () => {
        joinedLobbyHandler?.({ lobbyCode: defaultProps.code, success: true })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // First connection should not trigger reconnect sync.
      expect(onStateSync).not.toHaveBeenCalled()

      const disconnectHandler = getHandler<(reason: string) => void>('disconnect')
      await act(async () => {
        disconnectHandler?.('transport close')
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      const reconnectAttemptHandler = getHandler<(attempt: number) => void>('reconnect_attempt')
      await act(async () => {
        reconnectAttemptHandler?.(2)
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Reconnect should wait for JOINED_LOBBY acknowledgment.
      expect(onStateSync).not.toHaveBeenCalled()

      await act(async () => {
        joinedLobbyHandler?.({ lobbyCode: defaultProps.code, success: true })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(onStateSync).toHaveBeenCalledTimes(1)
      expect(analytics.trackSocketReconnectRecovered).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptsTotal: 2,
          isGuest: false,
        })
      )
    })

    it('should retry lobby join when join confirmation times out', async () => {
      jest.useFakeTimers()
      try {
        renderHook(() => useSocketConnection(defaultProps))
        await waitForSocketInit()

        const connectHandler = getHandler<() => void>('connect')

        await act(async () => {
          connectHandler?.()
        })

        const getJoinLobbyCalls = () =>
          mockSocket.emit.mock.calls.filter((call: any[]) => call[0] === 'join-lobby').length

        const initialJoinCalls = getJoinLobbyCalls()
        expect(initialJoinCalls).toBe(1)

        await act(async () => {
          jest.advanceTimersByTime(4600)
        })

        expect(getJoinLobbyCalls()).toBeGreaterThan(initialJoinCalls)
        expect(analytics.trackLobbyJoinAckTimeout).toHaveBeenCalled()
        expect(analytics.trackLobbyJoinRetry).toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    it('tracks only one final reconnect failure per reconnect cycle', async () => {
      jest.useFakeTimers()
      try {
        renderHook(() => useSocketConnection(defaultProps))
        await waitForSocketInit()

        const connectHandler = getHandler<() => void>('connect')
        const disconnectHandler = getHandler<(reason: string) => void>('disconnect')
        const reconnectFailedHandler = getHandler<() => void>('reconnect_failed')

        await act(async () => {
          connectHandler?.()
        })

        // Drive JOIN_LOBBY retries to terminal timeout (max attempts).
        await act(async () => {
          jest.advanceTimersByTime(20000)
        })

        expect(analytics.trackSocketReconnectFailedFinal).toHaveBeenCalledTimes(1)

        await act(async () => {
          reconnectFailedHandler?.()
        })

        // Same cycle: should not emit second terminal failure event.
        expect(analytics.trackSocketReconnectFailedFinal).toHaveBeenCalledTimes(1)

        await act(async () => {
          disconnectHandler?.('transport close')
        })

        await act(async () => {
          reconnectFailedHandler?.()
        })

        // New cycle after disconnect: terminal failure can be tracked again.
        expect(analytics.trackSocketReconnectFailedFinal).toHaveBeenCalledTimes(2)
      } finally {
        jest.useRealTimers()
      }
    })

    it('should track reconnect attempt telemetry', async () => {
      renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      const reconnectAttemptHandler = getHandler<(attempt: number) => void>('reconnect_attempt')

      await act(async () => {
        reconnectAttemptHandler?.(3)
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(analytics.trackSocketReconnectAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 3,
          isGuest: false,
          reason: 'reconnect_attempt',
        })
      )
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
    it('should not create a socket after unmount when auth token fetch resolves late', async () => {
      const { io } = jest.requireMock('socket.io-client') as { io: jest.Mock }

      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  statusText: 'OK',
                  json: async () => ({ token: 'late.socket.jwt' }),
                }),
              40
            )
          ) as any
      )

      const { unmount } = renderHook(() => useSocketConnection(defaultProps))
      unmount()

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80))
      })

      expect(io).not.toHaveBeenCalled()
    })

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
    it('should emit immediately when connected and lobby join is confirmed', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      const connectHandler = getHandler<() => void>('connect')
      const joinedLobbyHandler = getHandler<(payload: { lobbyCode: string; success: boolean }) => void>('joined-lobby')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 50))
      })
      await act(async () => {
        joinedLobbyHandler?.({ lobbyCode: defaultProps.code, success: true })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(result.current.isConnected).toBe(true)

      mockSocket.emit.mockClear()

      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' })
    })

    it('should queue event until lobby join is confirmed', async () => {
      const { result } = renderHook(() => useSocketConnection(defaultProps))
      await waitForSocketInit()

      expect(result.current.isConnected).toBe(false)

      act(() => {
        result.current.emitWhenConnected('test-event', { data: 'test' })
      })

      expect(mockSocket.emit).not.toHaveBeenCalledWith('test-event', { data: 'test' })

      const connectHandler = getHandler<() => void>('connect')
      const joinedLobbyHandler = getHandler<(payload: { lobbyCode: string; success: boolean }) => void>('joined-lobby')

      await act(async () => {
        connectHandler?.()
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // Connected transport alone is not enough; wait for join ACK.
      expect(mockSocket.emit).not.toHaveBeenCalledWith('test-event', { data: 'test' })

      await act(async () => {
        joinedLobbyHandler?.({ lobbyCode: defaultProps.code, success: true })
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(mockSocket.emit).toHaveBeenCalledWith('test-event', { data: 'test' })
    })
  })
})
