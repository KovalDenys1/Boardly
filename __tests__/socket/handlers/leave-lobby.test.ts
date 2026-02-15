import { createLeaveLobbyHandler } from '../../../lib/socket/handlers/leave-lobby'
import { SocketRooms } from '../../../types/socket-events'

describe('createLeaveLobbyHandler', () => {
  type HandlerSocket = Parameters<ReturnType<typeof createLeaveLobbyHandler>>[0]

  function createDeps(overrides?: Partial<Parameters<typeof createLeaveLobbyHandler>[0]>) {
    return {
      socketMonitor: {
        trackEvent: jest.fn(),
      },
      socketLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
      }),
      revokeSocketLobbyAuthorization: jest.fn(),
      disconnectSyncManager: {
        clearPendingAbruptDisconnect: jest.fn(),
      },
      ...overrides,
    }
  }

  function createSocket(overrides?: Partial<HandlerSocket>): HandlerSocket {
    return {
      id: 'socket-1',
      rooms: new Set<string>(['socket-1', 'lobby:ABCD']),
      leave: jest.fn(),
      data: {
        user: {
          id: 'user-1',
        },
      },
      ...overrides,
    } as HandlerSocket
  }

  it('leaves lobby room and clears auth/disconnect state', () => {
    const deps = createDeps()
    const handler = createLeaveLobbyHandler(deps)
    const socket = createSocket()

    handler(socket, ' ABCD ')

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('leave-lobby')
    expect(socket.leave).toHaveBeenCalledWith(SocketRooms.lobby('ABCD'))
    expect(deps.revokeSocketLobbyAuthorization).toHaveBeenCalledWith(socket, 'ABCD')
    expect(deps.disconnectSyncManager.clearPendingAbruptDisconnect).toHaveBeenCalledWith(
      'ABCD',
      'user-1',
      'left-lobby-explicitly'
    )
    expect(deps.socketLogger).toHaveBeenCalledWith('leave-lobby')
    const socketLoggerMock = deps.socketLogger as jest.Mock
    expect(socketLoggerMock.mock.results[0].value.debug).toHaveBeenCalledWith(
      'Socket left lobby',
      expect.objectContaining({
        socketId: 'socket-1',
        lobbyCode: 'ABCD',
      })
    )
  })

  it('ignores empty lobby code', () => {
    const deps = createDeps()
    const handler = createLeaveLobbyHandler(deps)
    const socket = createSocket()

    handler(socket, '   ')

    expect(deps.socketMonitor.trackEvent).not.toHaveBeenCalled()
    expect(socket.leave).not.toHaveBeenCalled()
    expect(deps.revokeSocketLobbyAuthorization).not.toHaveBeenCalled()
  })

  it('ignores non-string lobby code', () => {
    const deps = createDeps()
    const handler = createLeaveLobbyHandler(deps)
    const socket = createSocket()

    handler(socket, 123 as unknown as string)

    expect(deps.socketMonitor.trackEvent).not.toHaveBeenCalled()
    expect(socket.leave).not.toHaveBeenCalled()
    expect(deps.revokeSocketLobbyAuthorization).not.toHaveBeenCalled()
  })

  it('does not clear pending disconnect for missing user id', () => {
    const deps = createDeps()
    const handler = createLeaveLobbyHandler(deps)
    const socket = createSocket({
      data: {
        user: {},
      },
    })

    handler(socket, 'ABCD')

    expect(deps.disconnectSyncManager.clearPendingAbruptDisconnect).not.toHaveBeenCalled()
    expect(socket.leave).toHaveBeenCalledWith(SocketRooms.lobby('ABCD'))
  })
})
