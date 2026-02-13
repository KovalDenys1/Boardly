import { createLobbyListMembershipHandlers } from '../../../lib/socket/handlers/lobby-list-membership'
import { SocketRooms } from '../../../types/socket-events'

describe('createLobbyListMembershipHandlers', () => {
  function createDeps(overrides?: Partial<Parameters<typeof createLobbyListMembershipHandlers>[0]>) {
    return {
      socketMonitor: {
        trackEvent: jest.fn(),
      },
      socketLogger: jest.fn().mockReturnValue({
        debug: jest.fn(),
      }),
      ...overrides,
    }
  }

  function createSocket() {
    return {
      id: 'socket-1',
      join: jest.fn(),
      leave: jest.fn(),
    }
  }

  it('joins lobby-list room and tracks event', () => {
    const deps = createDeps()
    const { handleJoinLobbyList } = createLobbyListMembershipHandlers(deps)
    const socket = createSocket()

    handleJoinLobbyList(socket)

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('join-lobby-list')
    expect(socket.join).toHaveBeenCalledWith(SocketRooms.lobbyList())
    expect(deps.socketLogger).toHaveBeenCalledWith('join-lobby-list')
    const socketLoggerMock = deps.socketLogger as jest.Mock
    expect(socketLoggerMock.mock.results[0].value.debug).toHaveBeenCalledWith(
      'Socket joined lobby-list',
      { socketId: 'socket-1' }
    )
  })

  it('leaves lobby-list room and tracks event', () => {
    const deps = createDeps()
    const { handleLeaveLobbyList } = createLobbyListMembershipHandlers(deps)
    const socket = createSocket()

    handleLeaveLobbyList(socket)

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('leave-lobby-list')
    expect(socket.leave).toHaveBeenCalledWith(SocketRooms.lobbyList())
    expect(deps.socketLogger).toHaveBeenCalledWith('leave-lobby-list')
    const socketLoggerMock = deps.socketLogger as jest.Mock
    expect(socketLoggerMock.mock.results[0].value.debug).toHaveBeenCalledWith(
      'Socket left lobby-list',
      { socketId: 'socket-1' }
    )
  })
})
