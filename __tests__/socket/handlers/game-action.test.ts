import { createGameActionHandler } from '../../../lib/socket/handlers/game-action'

describe('createGameActionHandler', () => {
  type HandlerSocket = Parameters<ReturnType<typeof createGameActionHandler>>[0]

  function createDeps(overrides?: Partial<Parameters<typeof createGameActionHandler>[0]>) {
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
      emitGameUpdateToOthers: jest.fn(),
      notifyLobbyListUpdate: jest.fn(),
      ...overrides,
    }
  }

  function createSocket(overrides?: Partial<HandlerSocket>): HandlerSocket {
    return {
      id: 'socket-1',
      data: {
        user: {
          id: 'user-1',
        },
      },
      rooms: new Set<string>(['socket-1', 'lobby:ABCD']),
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
      ...overrides,
    }
  }

  it('emits INVALID_ACTION_DATA for malformed payload', async () => {
    const deps = createDeps()
    const handler = createGameActionHandler(deps)
    const socket = createSocket()

    await handler(socket, {} as never)

    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'INVALID_ACTION_DATA',
      'Invalid action data',
      'errors.invalidActionData'
    )
    expect(deps.emitGameUpdateToOthers).not.toHaveBeenCalled()
  })

  it('emits INVALID_LOBBY_CODE when lobby code is blank after trim', async () => {
    const deps = createDeps()
    const handler = createGameActionHandler(deps)
    const socket = createSocket()

    await handler(socket, {
      lobbyCode: '   ',
      action: 'state-change',
      payload: { state: {} },
    })

    expect(deps.emitError).toHaveBeenCalledWith(
      socket,
      'INVALID_LOBBY_CODE',
      'Invalid lobby code',
      'errors.invalidLobbyCode'
    )
  })

  it('ignores unsupported action type without broadcasting', async () => {
    const deps = createDeps()
    const handler = createGameActionHandler(deps)
    const socket = createSocket()

    await handler(socket, {
      lobbyCode: 'ABCD',
      action: 'player-left',
      payload: {},
    })

    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Invalid action type',
      expect.objectContaining({
        action: 'player-left',
        socketId: 'socket-1',
      })
    )
    expect(deps.emitGameUpdateToOthers).not.toHaveBeenCalled()
    expect(deps.notifyLobbyListUpdate).not.toHaveBeenCalled()
  })

  it('broadcasts supported action to peers and notifies lobby list', async () => {
    const deps = createDeps()
    const handler = createGameActionHandler(deps)
    const socket = createSocket()

    await handler(socket, {
      lobbyCode: ' ABCD ',
      action: 'state-change',
      payload: { state: { turn: 1 } },
    })

    expect(deps.isSocketAuthorizedForLobby).toHaveBeenCalledWith(socket, 'ABCD')
    expect(deps.isUserActivePlayerInLobby).toHaveBeenCalledWith('ABCD', 'user-1')
    expect(deps.emitGameUpdateToOthers).toHaveBeenCalledWith(socket, 'ABCD', {
      action: 'state-change',
      payload: { state: { turn: 1 } },
      lobbyCode: 'ABCD',
    })
    expect(deps.notifyLobbyListUpdate).toHaveBeenCalled()
  })
})
