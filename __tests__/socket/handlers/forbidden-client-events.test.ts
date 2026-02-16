import { createForbiddenClientEventsHandlers } from '../../../lib/socket/handlers/forbidden-client-events'

describe('createForbiddenClientEventsHandlers', () => {
  function createDeps(
    overrides?: Partial<Parameters<typeof createForbiddenClientEventsHandlers>[0]>
  ): Parameters<typeof createForbiddenClientEventsHandlers>[0] {
    return {
      logger: {
        warn: jest.fn(),
      },
      socketMonitor: {
        trackEvent: jest.fn(),
      },
      emitError: jest.fn(),
      ...overrides,
    }
  }

  function createSocket() {
    return {
      id: 'socket-1',
      emit: jest.fn(),
      data: {
        user: {
          id: 'user-1',
        },
      },
    }
  }

  it('blocks client-side player-joined event', () => {
    const deps = createDeps()
    const { handleBlockedPlayerJoined } = createForbiddenClientEventsHandlers(deps)
    const socket = createSocket()

    handleBlockedPlayerJoined(socket)

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('blocked-player-joined')
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Blocked client-side player-joined event',
      expect.objectContaining({
        socketId: 'socket-1',
        userId: 'user-1',
      })
    )
    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'FORBIDDEN_ACTION',
      'Use server API to broadcast player events',
      'errors.forbidden'
    )
  })

  it('blocks client-side game-started event', () => {
    const deps = createDeps()
    const { handleBlockedGameStarted } = createForbiddenClientEventsHandlers(deps)
    const socket = createSocket()

    handleBlockedGameStarted(socket)

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('blocked-game-started')
    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Blocked client-side game-started event',
      expect.objectContaining({
        socketId: 'socket-1',
        userId: 'user-1',
      })
    )
    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'FORBIDDEN_ACTION',
      'Use server API to broadcast game events',
      'errors.forbidden'
    )
  })
})
