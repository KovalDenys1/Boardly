import { createSendChatMessageHandler } from '../../../lib/socket/handlers/send-chat-message'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'

describe('createSendChatMessageHandler', () => {
  type HandlerSocket = Parameters<ReturnType<typeof createSendChatMessageHandler>>[0]

  function createDeps(overrides?: Partial<Parameters<typeof createSendChatMessageHandler>[0]>) {
    return {
      logger: {
        warn: jest.fn(),
        error: jest.fn(),
      },
      socketMonitor: {
        trackEvent: jest.fn(),
      },
      checkRateLimit: jest.fn().mockReturnValue(true),
      emitError: jest.fn(),
      isSocketAuthorizedForLobby: jest.fn().mockReturnValue(true),
      isUserActivePlayerInLobby: jest.fn().mockResolvedValue(true),
      getUserDisplayName: jest.fn().mockReturnValue('Alice'),
      emitWithMetadata: jest.fn(),
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
          email: 'alice@example.com',
        },
      },
      rooms: new Set<string>(['socket-1', 'lobby:ABCD']),
      emit: jest.fn(),
      ...overrides,
    }
  }

  it('rejects malformed payload via runtime validation', async () => {
    const deps = createDeps()
    const handler = createSendChatMessageHandler(deps)
    const socket = createSocket()

    await handler(
      socket,
      {
        lobbyCode: 'ABCD',
        message: 123,
        userId: 'ignored',
        username: 'ignored',
      } as unknown as Parameters<ReturnType<typeof createSendChatMessageHandler>>[1]
    )

    expect(deps.logger.warn).toHaveBeenCalledWith('Invalid chat message data', { socketId: 'socket-1' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('emits LOBBY_ACCESS_DENIED when socket is not authorized', async () => {
    const deps = createDeps({
      isSocketAuthorizedForLobby: jest.fn().mockReturnValue(false),
    })
    const handler = createSendChatMessageHandler(deps)
    const socket = createSocket()

    await handler(socket, {
      lobbyCode: 'ABCD',
      message: 'Hello',
      userId: 'ignored',
      username: 'ignored',
    })

    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'LOBBY_ACCESS_DENIED',
      'Not authorized for this lobby',
      'errors.lobbyAccessDenied'
    )
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('broadcasts normalized chat message with server sender identity', async () => {
    const deps = createDeps()
    const handler = createSendChatMessageHandler(deps)
    const socket = createSocket()

    await handler(socket, {
      lobbyCode: ' ABCD ',
      message: '  hello world  ',
      userId: 'client-user',
      username: 'client-name',
    })

    expect(deps.isUserActivePlayerInLobby).toHaveBeenCalledWith('ABCD', 'user-1')
    expect(deps.emitWithMetadata).toHaveBeenCalledWith(
      SocketRooms.lobby('ABCD'),
      SocketEvents.CHAT_MESSAGE,
      expect.objectContaining({
        userId: 'user-1',
        username: 'Alice',
        message: 'hello world',
        lobbyCode: 'ABCD',
      })
    )
  })

  it('drops oversized messages without emitting error', async () => {
    const deps = createDeps()
    const handler = createSendChatMessageHandler(deps)
    const socket = createSocket()

    await handler(socket, {
      lobbyCode: 'ABCD',
      message: 'a'.repeat(501),
      userId: 'ignored',
      username: 'ignored',
    })

    expect(deps.logger.warn).toHaveBeenCalledWith('Invalid chat message data', { socketId: 'socket-1' })
    expect(deps.emitError).not.toHaveBeenCalled()
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })
})
