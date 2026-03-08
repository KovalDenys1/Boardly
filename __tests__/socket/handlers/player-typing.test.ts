import { createPlayerTypingHandler } from '../../../lib/socket/handlers/player-typing'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'

describe('createPlayerTypingHandler', () => {
  function createDeps(overrides?: Partial<Parameters<typeof createPlayerTypingHandler>[0]>) {
    const socketMonitor = {
      trackEvent: jest.fn(),
    }
    const checkRateLimit = jest.fn().mockReturnValue(true)
    const isSocketAuthorizedForLobby = jest.fn().mockReturnValue(true)
    const getUserDisplayName = jest.fn().mockReturnValue('Alice')
    const emitWithMetadata = jest.fn()

    return {
      socketMonitor,
      checkRateLimit,
      isSocketAuthorizedForLobby,
      getUserDisplayName,
      emitWithMetadata,
      ...overrides,
    }
  }

  function createSocket() {
    const to = jest.fn()
    const socket = {
      id: 'socket-1',
      data: {
        user: {
          id: 'user-1',
          username: 'Alice',
        },
      },
      rooms: new Set<string>(['socket-1', 'lobby:LOBBY1']),
      to,
    }
    return { socket }
  }

  it('broadcasts typing event to lobby peers when request is valid', () => {
    const deps = createDeps()
    const handler = createPlayerTypingHandler(deps)
    const { socket } = createSocket()

    handler(socket, {
      lobbyCode: ' LOBBY1 ',
      userId: 'ignored',
      username: 'ignored',
    })

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('player-typing')
    expect(deps.checkRateLimit).toHaveBeenCalledWith('socket-1')
    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledWith(socket, 'LOBBY1')
    expect(deps.emitWithMetadata).toHaveBeenCalledWith(
      SocketRooms.lobby('LOBBY1'),
      SocketEvents.PLAYER_TYPING,
      {
        userId: 'user-1',
        username: 'Alice',
      }
    )
  })

  it('throttles typing events per user and lobby to one event every 2 seconds', () => {
    let now = 1000
    const deps = createDeps({
      now: () => now,
    })
    const handler = createPlayerTypingHandler(deps)
    const { socket } = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })
    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })

    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(1)

    now += 2000
    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })

    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(2)
    expect(deps.emitWithMetadata).toHaveBeenNthCalledWith(2, SocketRooms.lobby('LOBBY1'), SocketEvents.PLAYER_TYPING, {
      userId: 'user-1',
      username: 'Alice',
    })
  })

  it('stops when rate limit is exceeded', () => {
    const deps = createDeps({
      checkRateLimit: jest.fn().mockReturnValue(false),
    })
    const handler = createPlayerTypingHandler(deps)
    const { socket } = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('player-typing')
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('stops when lobby code is missing or not authorized', () => {
    const deps = createDeps({
      isSocketAuthorizedForLobby: jest.fn().mockReturnValue(false),
    })
    const handler = createPlayerTypingHandler(deps)
    const { socket } = createSocket()

    handler(socket, { lobbyCode: '   ', userId: 'u', username: 'n' })
    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })

    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledTimes(1)
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('ignores malformed payload before auth checks', () => {
    const deps = createDeps()
    const handler = createPlayerTypingHandler(deps)
    const { socket } = createSocket()

    handler(socket, { userId: 'u', username: 'n' } as any)

    expect(deps.isSocketAuthorizedForLobby).not.toHaveBeenCalled()
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })
})
