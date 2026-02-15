import { createConnectionLifecycleHandlers } from '../../../lib/socket/handlers/connection-lifecycle'

describe('createConnectionLifecycleHandlers', () => {
  type HandlerSocket = Parameters<
    ReturnType<typeof createConnectionLifecycleHandlers>['handleDisconnecting']
  >[0]

  function createDeps(
    overrides?: Partial<Parameters<typeof createConnectionLifecycleHandlers>[0]>
  ): Parameters<typeof createConnectionLifecycleHandlers>[0] {
    return {
      logger: {
        info: jest.fn(),
      },
      socketMonitor: {
        onDisconnect: jest.fn(),
      },
      onlinePresence: {
        markUserOffline: jest.fn(),
      },
      clearSocketRateLimit: jest.fn(),
      hasAnotherActiveSocketForUser: jest.fn().mockReturnValue(false),
      getLobbyCodesFromRooms: jest.fn().mockReturnValue([]),
      disconnectSyncManager: {
        scheduleAbruptDisconnectForLobby: jest.fn(),
      },
      ...overrides,
    }
  }

  function createSocket(overrides?: Partial<HandlerSocket>): HandlerSocket {
    return {
      id: 'socket-1',
      rooms: new Set<string>(['socket-1', 'lobby:ABCD']),
      data: {
        user: {
          id: 'user-1',
          username: 'Alice',
          isGuest: false,
        },
      },
      ...overrides,
    } as HandlerSocket
  }

  it('schedules delayed disconnect sync for each lobby on disconnecting', () => {
    const deps = createDeps({
      getLobbyCodesFromRooms: jest.fn().mockReturnValue(['ABCD', 'WXYZ']),
    })
    const { handleDisconnecting } = createConnectionLifecycleHandlers(deps)
    const socket = createSocket()

    handleDisconnecting(socket)

    expect(deps.hasAnotherActiveSocketForUser).toHaveBeenCalledWith('user-1', 'socket-1')
    expect(deps.disconnectSyncManager.scheduleAbruptDisconnectForLobby).toHaveBeenCalledTimes(2)
    expect(deps.disconnectSyncManager.scheduleAbruptDisconnectForLobby).toHaveBeenCalledWith(
      'ABCD',
      socket.data.user
    )
    expect(deps.disconnectSyncManager.scheduleAbruptDisconnectForLobby).toHaveBeenCalledWith(
      'WXYZ',
      socket.data.user
    )
  })

  it('skips disconnect sync when another socket for user is active', () => {
    const deps = createDeps({
      hasAnotherActiveSocketForUser: jest.fn().mockReturnValue(true),
      getLobbyCodesFromRooms: jest.fn().mockReturnValue(['ABCD']),
    })
    const { handleDisconnecting } = createConnectionLifecycleHandlers(deps)
    const socket = createSocket()

    handleDisconnecting(socket)

    expect(deps.disconnectSyncManager.scheduleAbruptDisconnectForLobby).not.toHaveBeenCalled()
    expect(deps.logger.info).toHaveBeenCalledWith(
      'Skipping disconnect state sync because another socket is active',
      expect.objectContaining({
        userId: 'user-1',
        socketId: 'socket-1',
      })
    )
  })

  it('tracks disconnect, updates presence and clears rate limit', () => {
    const deps = createDeps()
    const { handleDisconnect } = createConnectionLifecycleHandlers(deps)
    const socket = createSocket()

    handleDisconnect(socket, 'client namespace disconnect')

    expect(deps.logger.info).toHaveBeenCalledWith('Client disconnected', {
      socketId: 'socket-1',
      reason: 'client namespace disconnect',
    })
    expect(deps.socketMonitor.onDisconnect).toHaveBeenCalledWith('socket-1')
    expect(deps.onlinePresence.markUserOffline).toHaveBeenCalledWith('user-1', 'socket-1')
    expect(deps.clearSocketRateLimit).toHaveBeenCalledWith('socket-1')
  })

  it('does not mark guest user offline on disconnect', () => {
    const deps = createDeps()
    const { handleDisconnect } = createConnectionLifecycleHandlers(deps)
    const socket = createSocket({
      data: {
        user: {
          id: 'guest-1',
          isGuest: true,
        },
      },
    })

    handleDisconnect(socket, 'transport close')

    expect(deps.onlinePresence.markUserOffline).not.toHaveBeenCalled()
    expect(deps.clearSocketRateLimit).toHaveBeenCalledWith('socket-1')
  })
})
