import { createLobbyCreatedHandler } from '../../../lib/socket/handlers/lobby-created'

describe('createLobbyCreatedHandler', () => {
  function createDeps(overrides?: Partial<Parameters<typeof createLobbyCreatedHandler>[0]>) {
    return {
      socketMonitor: {
        trackEvent: jest.fn(),
      },
      socketLogger: jest.fn().mockReturnValue({
        info: jest.fn(),
      }),
      notifyLobbyListUpdate: jest.fn(),
      ...overrides,
    }
  }

  it('tracks event, logs and notifies lobby list', () => {
    const deps = createDeps()
    const handler = createLobbyCreatedHandler(deps)

    handler()

    expect(deps.socketMonitor.trackEvent).toHaveBeenCalledWith('lobby-created')
    expect(deps.socketLogger).toHaveBeenCalledWith('lobby-created')
    const socketLoggerMock = deps.socketLogger as jest.Mock
    expect(socketLoggerMock.mock.results[0].value.info).toHaveBeenCalledWith(
      'New lobby created, notifying lobby list'
    )
    expect(deps.notifyLobbyListUpdate).toHaveBeenCalledTimes(1)
  })
})
