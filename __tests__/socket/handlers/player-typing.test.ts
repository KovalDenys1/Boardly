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

    return {
      socketMonitor,
      checkRateLimit,
      isSocketAuthorizedForLobby,
      getUserDisplayName,
      ...overrides,
    }
  }

  function createSocket() {
    const emit = jest.fn()
    const to = jest.fn().mockReturnValue({ emit })
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
    return { socket, to, emit }
  }

  it('broadcasts typing event to lobby peers when request is valid', () => {
    const deps = createDeps()
    const handler = createPlayerTypingHandler(deps)
    const { socket, to, emit } = createSocket()

    handler(socket, {
      lobbyCode: ' LOBBY1 ',
      userId: 'ignored',
      username: 'ignored',
    })

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('player-typing')
    expect(deps.checkRateLimit).toHaveBeenCalledWith('socket-1')
    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledWith(socket, 'LOBBY1')
    expect(to).toHaveBeenCalledWith(SocketRooms.lobby('LOBBY1'))
    expect(emit).toHaveBeenCalledWith(SocketEvents.PLAYER_TYPING, {
      userId: 'user-1',
      username: 'Alice',
    })
  })

  it('stops when rate limit is exceeded', () => {
    const deps = createDeps({
      checkRateLimit: jest.fn().mockReturnValue(false),
    })
    const handler = createPlayerTypingHandler(deps)
    const { socket, to } = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('player-typing')
    expect(to).not.toHaveBeenCalled()
  })

  it('stops when lobby code is missing or not authorized', () => {
    const deps = createDeps({
      isSocketAuthorizedForLobby: jest.fn().mockReturnValue(false),
    })
    const handler = createPlayerTypingHandler(deps)
    const { socket, to } = createSocket()

    handler(socket, { lobbyCode: '   ', userId: 'u', username: 'n' })
    handler(socket, { lobbyCode: 'LOBBY1', userId: 'u', username: 'n' })

    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledTimes(1)
    expect(to).not.toHaveBeenCalled()
  })

  it('ignores malformed payload before auth checks', () => {
    const deps = createDeps()
    const handler = createPlayerTypingHandler(deps)
    const { socket, to } = createSocket()

    handler(socket, { userId: 'u', username: 'n' } as unknown as { lobbyCode: string })

    expect(deps.isSocketAuthorizedForLobby).not.toHaveBeenCalled()
    expect(to).not.toHaveBeenCalled()
  })
})
