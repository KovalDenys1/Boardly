import { createSendReactionHandler } from '../../../lib/socket/handlers/send-reaction'
import { SocketEvents, SocketRooms } from '../../../types/socket-events'

const ALLOWED_EMOJIS = ['👍', '😂', '😮', '🎉', '🔥']

describe('createSendReactionHandler', () => {
  function createDeps(overrides?: Partial<Parameters<typeof createSendReactionHandler>[0]>) {
    return {
      socketMonitor: { trackEvent: jest.fn() },
      checkRateLimit: jest.fn().mockReturnValue(true),
      isSocketAuthorizedForLobby: jest.fn().mockReturnValue(true),
      getUserDisplayName: jest.fn().mockReturnValue('Alice'),
      emitWithMetadata: jest.fn(),
      now: jest.fn().mockReturnValue(1000),
      ...overrides,
    }
  }

  function createSocket() {
    return {
      id: 'socket-1',
      data: { user: { id: 'user-1', username: 'Alice' } },
      rooms: new Set<string>(['socket-1', 'lobby:LOBBY1']),
    }
  }

  it('broadcasts reaction to lobby room on valid payload', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    const socket = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', emoji: '👍' })

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('send-reaction')
    expect(deps.emitWithMetadata).toHaveBeenCalledWith(
      SocketRooms.lobby('LOBBY1'),
      SocketEvents.REACTION,
      expect.objectContaining({
        userId: 'user-1',
        username: 'Alice',
        emoji: '👍',
        timestamp: 1000,
      })
    )
    expect(deps.emitWithMetadata.mock.calls[0][2]).toHaveProperty('id')
  })

  it('trims lobby code before auth check', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    const socket = createSocket()

    handler(socket, { lobbyCode: ' LOBBY1 ', emoji: '👍' })

    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledWith(socket, 'LOBBY1')
    expect(deps.emitWithMetadata).toHaveBeenCalled()
  })

  it.each(ALLOWED_EMOJIS)('allows emoji %s', (emoji) => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji })
    expect(deps.emitWithMetadata).toHaveBeenCalled()
  })

  it('silently ignores emoji not in whitelist', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji: '💀' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('silently ignores when rate limited', () => {
    const deps = createDeps({ checkRateLimit: jest.fn().mockReturnValue(false) })
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji: '👍' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('silently ignores when socket not authorized for lobby', () => {
    const deps = createDeps({ isSocketAuthorizedForLobby: jest.fn().mockReturnValue(false) })
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: 'LOBBY1', emoji: '👍' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('silently ignores missing lobby code', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    handler(createSocket(), { lobbyCode: '   ', emoji: '👍' })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
  })

  it('throttles to one reaction per user per 3 seconds', () => {
    let now = 1000
    const deps = createDeps({ now: () => now })
    const handler = createSendReactionHandler(deps)
    const socket = createSocket()

    handler(socket, { lobbyCode: 'LOBBY1', emoji: '👍' })
    handler(socket, { lobbyCode: 'LOBBY1', emoji: '😂' })
    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(1)

    now += 3000
    handler(socket, { lobbyCode: 'LOBBY1', emoji: '🎉' })
    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(2)
  })

  it('throttles independently per user', () => {
    const deps = createDeps()
    const handler = createSendReactionHandler(deps)
    const socket1 = createSocket()
    const socket2 = { ...createSocket(), id: 'socket-2', data: { user: { id: 'user-2', username: 'Bob' } } }

    handler(socket1, { lobbyCode: 'LOBBY1', emoji: '👍' })
    handler(socket2, { lobbyCode: 'LOBBY1', emoji: '😂' })
    expect(deps.emitWithMetadata).toHaveBeenCalledTimes(2)
  })
})
