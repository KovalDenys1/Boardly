import { IncomingMessage } from 'http'
import { createJoinLobbyHandler } from '../../lib/socket/handlers/join-lobby'
import { createGameActionHandler } from '../../lib/socket/handlers/game-action'
import { createSendChatMessageHandler } from '../../lib/socket/handlers/send-chat-message'
import { createPlayerTypingHandler } from '../../lib/socket/handlers/player-typing'
import { createLeaveLobbyHandler } from '../../lib/socket/handlers/leave-lobby'
import {
  extractInternalRequestSecret,
  isInternalEndpointAuthorized,
  isSocketAuthorizedForLobby,
  markSocketLobbyAuthorized,
  revokeSocketLobbyAuthorization,
} from '../../lib/socket/socket-server-helpers'
import { SocketEvents, SocketRooms } from '../../types/socket-events'

type TestSocket = {
  id: string
  data: {
    user: {
      id: string
      username: string
      email?: string | null
    }
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
  emitted: Array<{ event: string; payload: unknown }>
  roomEmits: Array<{ room: string; event: string; payload: unknown }>
  join: jest.Mock
  leave: jest.Mock
  emit: jest.Mock
  to: jest.Mock
}

type SocketWithAuthorizationShape = {
  data: {
    authorizedLobbies?: Set<string>
  }
  rooms: Set<string>
}

function createSocket(socketId = 'socket-1'): TestSocket {
  const rooms = new Set<string>([socketId])
  const emitted: Array<{ event: string; payload: unknown }> = []
  const roomEmits: Array<{ room: string; event: string; payload: unknown }> = []

  return {
    id: socketId,
    data: {
      user: {
        id: 'user-1',
        username: 'Alice',
        email: 'alice@example.com',
      },
    },
    rooms,
    emitted,
    roomEmits,
    join: jest.fn((room: string) => {
      rooms.add(room)
    }),
    leave: jest.fn((room: string) => {
      rooms.delete(room)
    }),
    emit: jest.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }),
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) => {
        roomEmits.push({ room, event, payload })
      },
    })),
  }
}

function createDependencies(overrides?: Record<string, unknown>) {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const socketLogger = jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
  })

  const socketMonitor = {
    trackEvent: jest.fn(),
  }

  const deps = {
    logger,
    socketLogger,
    socketMonitor,
    checkRateLimit: jest.fn().mockReturnValue(true),
    emitError: jest.fn(),
    findLobbyByCode: jest.fn().mockResolvedValue({ id: 'lobby-1', code: 'ABCD', isActive: true }),
    isUserActivePlayerInLobby: jest.fn().mockResolvedValue(true),
    disconnectSyncManager: {
      clearPendingAbruptDisconnect: jest.fn(),
      syncPlayerConnectionStateInLobby: jest.fn().mockResolvedValue({}),
    },
    emitGameUpdateToOthers: jest.fn(),
    notifyLobbyListUpdate: jest.fn(),
    getUserDisplayName: jest.fn((user?: { username?: string | null; email?: string | null }) =>
      user?.username || user?.email || 'Player'
    ),
    emitWithMetadata: jest.fn(),
    ...(overrides || {}),
  }

  const markAuthorizedLobby = (socket: unknown, lobbyCode: string) => {
    markSocketLobbyAuthorized(socket as SocketWithAuthorizationShape, lobbyCode)
  }

  const revokeAuthorizedLobby = (socket: unknown, lobbyCode: string) => {
    revokeSocketLobbyAuthorization(socket as SocketWithAuthorizationShape, lobbyCode)
  }

  const joinLobby = createJoinLobbyHandler({
    logger,
    socketLogger,
    findLobbyByCode: deps.findLobbyByCode,
    socketMonitor,
    checkRateLimit: deps.checkRateLimit,
    emitError: deps.emitError,
    isUserActivePlayerInLobby: deps.isUserActivePlayerInLobby,
    markSocketLobbyAuthorized: markAuthorizedLobby,
    disconnectSyncManager: deps.disconnectSyncManager,
  })

  const gameAction = createGameActionHandler({
    logger,
    socketMonitor,
    checkRateLimit: deps.checkRateLimit,
    emitError: deps.emitError,
    isSocketAuthorizedForLobby,
    isUserActivePlayerInLobby: deps.isUserActivePlayerInLobby,
    emitGameUpdateToOthers: deps.emitGameUpdateToOthers,
    notifyLobbyListUpdate: deps.notifyLobbyListUpdate,
  })

  const sendChatMessage = createSendChatMessageHandler({
    logger,
    socketMonitor,
    checkRateLimit: deps.checkRateLimit,
    emitError: deps.emitError,
    isSocketAuthorizedForLobby,
    isUserActivePlayerInLobby: deps.isUserActivePlayerInLobby,
    getUserDisplayName: deps.getUserDisplayName,
    emitWithMetadata: deps.emitWithMetadata,
  })

  const playerTyping = createPlayerTypingHandler({
    socketMonitor,
    checkRateLimit: deps.checkRateLimit,
    isSocketAuthorizedForLobby,
    getUserDisplayName: deps.getUserDisplayName,
  })

  const leaveLobby = createLeaveLobbyHandler({
    socketMonitor,
    socketLogger,
    revokeSocketLobbyAuthorization: revokeAuthorizedLobby,
    disconnectSyncManager: deps.disconnectSyncManager,
  })

  return {
    ...deps,
    joinLobby,
    gameAction,
    sendChatMessage,
    playerTyping,
    leaveLobby,
  }
}

describe('Socket event critical flow', () => {
  it('blocks gameplay and chat before lobby authorization', async () => {
    const socket = createSocket()
    const deps = createDependencies()

    await deps.gameAction(socket, {
      lobbyCode: 'ABCD',
      action: 'state-change',
      payload: { turn: 1 },
    })

    await deps.sendChatMessage(socket, {
      lobbyCode: 'ABCD',
      message: 'hello',
      userId: socket.data.user.id,
      username: socket.data.user.username,
    })

    deps.playerTyping(socket, {
      lobbyCode: 'ABCD',
      userId: socket.data.user.id,
      username: socket.data.user.username,
    })

    expect(deps.emitGameUpdateToOthers).not.toHaveBeenCalled()
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
    expect(socket.roomEmits).toEqual([])
    expect(deps.emitError).toHaveBeenNthCalledWith(
      1,
      socket,
      'LOBBY_ACCESS_DENIED',
      'Not authorized for this lobby',
      'errors.lobbyAccessDenied'
    )
    expect(deps.emitError).toHaveBeenNthCalledWith(
      2,
      socket,
      'LOBBY_ACCESS_DENIED',
      'Not authorized for this lobby',
      'errors.lobbyAccessDenied'
    )
  })

  it('allows join -> action/chat/typing and revokes access after leave', async () => {
    const socket = createSocket()
    const deps = createDependencies()

    await deps.joinLobby(socket, 'ABCD')

    expect(socket.rooms.has(SocketRooms.lobby('ABCD'))).toBe(true)
    expect(isSocketAuthorizedForLobby(socket, 'ABCD')).toBe(true)
    expect(socket.emitted).toContainEqual({
      event: SocketEvents.JOINED_LOBBY,
      payload: { lobbyCode: 'ABCD', success: true },
    })

    await deps.gameAction(socket, {
      lobbyCode: 'ABCD',
      action: 'state-change',
      payload: { turn: 2 },
    })

    expect(deps.emitGameUpdateToOthers).toHaveBeenCalledWith(socket, 'ABCD', {
      action: 'state-change',
      payload: { turn: 2 },
      lobbyCode: 'ABCD',
    })
    expect(deps.notifyLobbyListUpdate).toHaveBeenCalledTimes(1)

    await deps.sendChatMessage(socket, {
      lobbyCode: 'ABCD',
      message: '  hello team  ',
      userId: socket.data.user.id,
      username: socket.data.user.username,
    })

    expect(deps.emitWithMetadata).toHaveBeenCalledWith(
      SocketRooms.lobby('ABCD'),
      SocketEvents.CHAT_MESSAGE,
      expect.objectContaining({
        userId: 'user-1',
        username: 'Alice',
        message: 'hello team',
        lobbyCode: 'ABCD',
      })
    )

    deps.playerTyping(socket, {
      lobbyCode: 'ABCD',
      userId: socket.data.user.id,
      username: socket.data.user.username,
    })

    expect(socket.roomEmits).toContainEqual({
      room: SocketRooms.lobby('ABCD'),
      event: SocketEvents.PLAYER_TYPING,
      payload: { userId: 'user-1', username: 'Alice' },
    })

    deps.leaveLobby(socket, 'ABCD')

    expect(socket.rooms.has(SocketRooms.lobby('ABCD'))).toBe(false)
    expect(isSocketAuthorizedForLobby(socket, 'ABCD')).toBe(false)

    deps.emitError.mockClear()
    deps.emitGameUpdateToOthers.mockClear()

    await deps.gameAction(socket, {
      lobbyCode: 'ABCD',
      action: 'state-change',
      payload: { turn: 3 },
    })

    expect(deps.emitGameUpdateToOthers).not.toHaveBeenCalled()
    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'LOBBY_ACCESS_DENIED',
      'Not authorized for this lobby',
      'errors.lobbyAccessDenied'
    )
  })
})

describe('Socket server helper auth', () => {
  it('extracts internal secret from explicit header and bearer token', () => {
    const headerRequest = {
      headers: {
        'x-socket-internal-secret': 'secret-123',
      },
    } as unknown as IncomingMessage

    const bearerRequest = {
      headers: {
        authorization: 'Bearer bearer-secret',
      },
    } as unknown as IncomingMessage

    expect(extractInternalRequestSecret(headerRequest)).toBe('secret-123')
    expect(extractInternalRequestSecret(bearerRequest)).toBe('bearer-secret')
  })

  it('authorizes internal endpoint in development, but validates secret in production', () => {
    const request = {
      headers: {
        authorization: 'Bearer expected-secret',
      },
    } as unknown as IncomingMessage

    const logger = {
      warn: jest.fn(),
      error: jest.fn(),
    }

    expect(isInternalEndpointAuthorized(request, logger, 'development', undefined)).toBe(true)
    expect(isInternalEndpointAuthorized(request, logger, 'production', 'expected-secret')).toBe(true)
    expect(isInternalEndpointAuthorized(request, logger, 'production', 'wrong-secret')).toBe(false)
  })
})
