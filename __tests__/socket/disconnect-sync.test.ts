import { createDisconnectSyncManager } from '@/lib/socket/disconnect-sync'

describe('createDisconnectSyncManager', () => {
  const user = { id: 'user-1', username: 'Alice' }
  type DisconnectSyncOptions = Parameters<typeof createDisconnectSyncManager>[0]

  function createDeps(overrides?: Partial<DisconnectSyncOptions>) {
    const io = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    }

    const prisma = {
      games: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      players: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      lobbies: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
    }

    const defaults: DisconnectSyncOptions = {
      io,
      prisma: prisma as unknown as DisconnectSyncOptions['prisma'],
      logger,
      emitWithMetadata: jest.fn(),
      hasAnyActiveSocketForUserInLobby: jest.fn().mockReturnValue(false),
      disconnectGraceMs: 200,
    }

    return { ...defaults, ...overrides }
  }

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns unchanged result when there is no active game in lobby', async () => {
    const deps = createDeps()
    const manager = createDisconnectSyncManager(deps)

    const result = await manager.syncPlayerConnectionStateInLobby('ABCD', user.id, false, {
      advanceTurnIfCurrent: true,
    })

    expect(result).toEqual({
      updated: false,
      turnAdvanced: false,
      skippedPlayerIds: [],
    })
    expect(deps.prisma.games.findFirst).toHaveBeenCalledTimes(1)
    expect(deps.prisma.games.updateMany).not.toHaveBeenCalled()
  })

  it('cancels scheduled abrupt disconnect cleanup when cleared manually', async () => {
    jest.useFakeTimers()
    const deps = createDeps()
    const manager = createDisconnectSyncManager(deps)

    manager.scheduleAbruptDisconnectForLobby('ABCD', user)
    manager.clearPendingAbruptDisconnect('ABCD', user.id, 'manual-clear')

    jest.advanceTimersByTime(1000)
    await Promise.resolve()

    expect(deps.prisma.games.findFirst).not.toHaveBeenCalled()
    expect(deps.logger.info).toHaveBeenCalledWith(
      'Cancelled pending disconnect sync',
      expect.objectContaining({
        lobbyCode: 'ABCD',
        userId: user.id,
        reason: 'manual-clear',
      })
    )
  })

  it('skips delayed cleanup when user reconnects before grace timeout', async () => {
    jest.useFakeTimers()
    const hasAnyActiveSocketForUserInLobby = jest.fn().mockReturnValue(true)
    const deps = createDeps({ hasAnyActiveSocketForUserInLobby })
    const manager = createDisconnectSyncManager(deps)

    manager.scheduleAbruptDisconnectForLobby('ABCD', user)

    jest.advanceTimersByTime(250)
    await Promise.resolve()

    expect(hasAnyActiveSocketForUserInLobby).toHaveBeenCalledWith(user.id, 'ABCD')
    expect(deps.prisma.games.findFirst).not.toHaveBeenCalled()
    expect(deps.logger.info).toHaveBeenCalledWith(
      'Skipping delayed disconnect sync because user reconnected',
      expect.objectContaining({
        lobbyCode: 'ABCD',
        userId: user.id,
      })
    )
  })
})
