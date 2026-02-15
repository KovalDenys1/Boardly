import { createJoinLobbyHandler } from '../../../lib/socket/handlers/join-lobby'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'

describe('createJoinLobbyHandler', () => {
  type HandlerSocket = Parameters<ReturnType<typeof createJoinLobbyHandler>>[0]

  function createDeps(overrides?: Partial<Parameters<typeof createJoinLobbyHandler>[0]>) {
    return {
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      socketLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
      }),
      prisma: {
        lobbies: {
          findUnique: jest.fn(),
        },
      } as unknown as Parameters<typeof createJoinLobbyHandler>[0]['prisma'],
      socketMonitor: {
        trackEvent: jest.fn(),
      },
      checkRateLimit: jest.fn().mockReturnValue(true),
      emitError: jest.fn(),
      isUserActivePlayerInLobby: jest.fn().mockResolvedValue(true),
      markSocketLobbyAuthorized: jest.fn(),
      disconnectSyncManager: {
        clearPendingAbruptDisconnect: jest.fn(),
        syncPlayerConnectionStateInLobby: jest.fn().mockResolvedValue({}),
      },
      ...overrides,
    }
  }

  function createSocket(overrides?: Partial<HandlerSocket>): HandlerSocket {
    return {
      id: 'socket-1',
      data: {
        user: {
          id: 'user-1',
          username: 'Alice',
        },
      },
      rooms: new Set<string>(['socket-1']),
      join: jest.fn(),
      emit: jest.fn(),
      ...overrides,
    }
  }

  it('rejects invalid lobby code before database access', async () => {
    const deps = createDeps()
    const handler = createJoinLobbyHandler(deps)
    const socket = createSocket()

    await handler(socket, '   ')

    expect(deps.prisma.lobbies.findUnique).not.toHaveBeenCalled()
    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'INVALID_LOBBY_CODE',
      'Invalid lobby code',
      'errors.invalidLobbyCode'
    )
  })

  it('rejects join when user is not active lobby player', async () => {
    const deps = createDeps({
      isUserActivePlayerInLobby: jest.fn().mockResolvedValue(false),
    })
    ;(deps.prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      id: 'lobby-1',
      code: 'ABCD',
      isActive: true,
    })
    const handler = createJoinLobbyHandler(deps)
    const socket = createSocket()

    await handler(socket, ' ABCD ')

    expect(deps.isUserActivePlayerInLobby).toHaveBeenCalledWith('ABCD', 'user-1')
    expect(socket.join).not.toHaveBeenCalled()
    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'LOBBY_ACCESS_DENIED',
      'You are not a member of this lobby',
      'errors.lobbyAccessDenied'
    )
  })

  it('joins lobby, authorizes socket and emits success', async () => {
    const deps = createDeps()
    ;(deps.prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
      id: 'lobby-1',
      code: 'ABCD',
      isActive: true,
    })
    const handler = createJoinLobbyHandler(deps)
    const socket = createSocket()

    await handler(socket, 'ABCD')

    expect(socket.join).toHaveBeenCalledWith(SocketRooms.lobby('ABCD'))
    expect(deps.markSocketLobbyAuthorized).toHaveBeenCalledWith(socket, 'ABCD')
    expect(deps.disconnectSyncManager.clearPendingAbruptDisconnect).toHaveBeenCalledWith(
      'ABCD',
      'user-1',
      'rejoined-lobby'
    )
    expect(deps.disconnectSyncManager.syncPlayerConnectionStateInLobby).toHaveBeenCalledWith(
      'ABCD',
      'user-1',
      true,
      { advanceTurnIfCurrent: false }
    )
    expect(socket.emit).toHaveBeenCalledWith(SocketEvents.JOINED_LOBBY, {
      lobbyCode: 'ABCD',
      success: true,
    })
  })
})
