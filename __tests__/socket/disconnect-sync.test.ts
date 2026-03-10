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

  it('updates persisted connection state and advances the turn past a disconnected current player', async () => {
    const updatedAt = new Date('2026-03-09T12:00:00.000Z')
    const prisma = {
      games: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'game-active-1',
          state: {
            players: [
              { id: user.id, isActive: true },
              { id: 'user-2', isActive: true },
            ],
            currentPlayerIndex: 0,
            data: {
              held: [true, true, false],
              rollsLeft: 1,
            },
          },
          currentTurn: 0,
          updatedAt,
          players: [
            {
              userId: user.id,
              position: 0,
              user: { username: 'Alice', email: 'alice@example.com', bot: null },
            },
            {
              userId: 'user-2',
              position: 1,
              user: { username: 'Bob', email: 'bob@example.com', bot: null },
            },
          ],
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      players: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      lobbies: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }

    const deps = createDeps({
      prisma: prisma as unknown as DisconnectSyncOptions['prisma'],
    })
    const manager = createDisconnectSyncManager(deps)

    const result = await manager.syncPlayerConnectionStateInLobby('ABCD', user.id, false, {
      advanceTurnIfCurrent: true,
    })

    expect(result.updated).toBe(true)
    expect(result.turnAdvanced).toBe(true)
    expect(result.skippedPlayerIds).toEqual([user.id])
    expect(result.updatedState?.currentPlayerIndex).toBe(1)
    expect(result.updatedState?.players?.[0]).toMatchObject({
      id: user.id,
      isActive: false,
    })
    expect(result.updatedState?.data).toMatchObject({
      held: [false, false, false],
      rollsLeft: 3,
    })
    expect(prisma.games.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'game-active-1',
        currentTurn: 0,
        updatedAt,
      },
      data: expect.objectContaining({
        currentTurn: 1,
        lastMoveAt: expect.any(Date),
        updatedAt: expect.any(Date),
        state: expect.objectContaining({
          currentPlayerIndex: 1,
          players: expect.arrayContaining([
            expect.objectContaining({
              id: user.id,
              isActive: false,
            }),
          ]),
        }),
      }),
    })
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

  it('clears pending delayed disconnect timers on dispose', async () => {
    jest.useFakeTimers()
    const deps = createDeps()
    const manager = createDisconnectSyncManager(deps)

    manager.scheduleAbruptDisconnectForLobby('ABCD', user)
    manager.dispose()

    jest.advanceTimersByTime(1000)
    await Promise.resolve()

    expect(deps.prisma.games.findFirst).not.toHaveBeenCalled()
  })

  it('logs delayed disconnect failures instead of throwing unhandled errors', async () => {
    const deps = createDeps({
      disconnectGraceMs: 10,
      prisma: {
        games: {
          findFirst: jest.fn().mockRejectedValue(new Error('db down')),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        players: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        lobbies: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      } as DisconnectSyncOptions['prisma'],
    })
    const manager = createDisconnectSyncManager(deps)

    manager.scheduleAbruptDisconnectForLobby('ABCD', user)

    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(deps.logger.warn).toHaveBeenCalledWith(
      'Delayed disconnect sync failed',
      expect.objectContaining({
        lobbyCode: 'ABCD',
        userId: user.id,
        error: 'db down',
      })
    )
  })

  it('does not remove players from games that already left waiting state', async () => {
    const prisma = {
      games: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'game-1',
            players: [
              {
                id: 'player-1',
                userId: user.id,
                user: {
                  username: 'Alice',
                  email: 'alice@example.com',
                  bot: null,
                },
              },
            ],
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      players: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      lobbies: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }

    const deps = createDeps({
      disconnectGraceMs: 10,
      prisma: prisma as unknown as DisconnectSyncOptions['prisma'],
    })
    const manager = createDisconnectSyncManager(deps)

    manager.scheduleAbruptDisconnectForLobby('ABCD', user)

    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(prisma.players.deleteMany).toHaveBeenCalledWith({
      where: {
        gameId: 'game-1',
        userId: user.id,
        game: {
          status: 'waiting',
        },
      },
    })
    expect(deps.emitWithMetadata).not.toHaveBeenCalled()
    expect(prisma.lobbies.updateMany).not.toHaveBeenCalled()
  })

  it('removes the last human from a waiting lobby and deactivates the lobby when only bots remain', async () => {
    jest.useFakeTimers()
    const prisma = {
      games: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'waiting-game-1',
            players: [
              {
                id: 'player-human',
                userId: user.id,
                user: {
                  username: 'Alice',
                  email: 'alice@example.com',
                  bot: null,
                },
              },
              {
                id: 'player-bot',
                userId: 'bot-1',
                user: {
                  username: 'Bot',
                  email: null,
                  bot: { difficulty: 'medium' },
                },
              },
            ],
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      players: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lobbies: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }

    const io = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    }
    const emitWithMetadata = jest.fn()
    const deps = createDeps({
      disconnectGraceMs: 10,
      io: io as DisconnectSyncOptions['io'],
      prisma: prisma as unknown as DisconnectSyncOptions['prisma'],
      emitWithMetadata,
    })
    const manager = createDisconnectSyncManager(deps)

    manager.scheduleAbruptDisconnectForLobby('ABCD', user)

    await jest.advanceTimersByTimeAsync(20)

    expect(prisma.players.deleteMany).toHaveBeenCalledWith({
      where: {
        gameId: 'waiting-game-1',
        userId: user.id,
        game: {
          status: 'waiting',
        },
      },
    })
    expect(prisma.lobbies.updateMany).toHaveBeenCalledWith({
      where: {
        code: 'ABCD',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    })
    expect(emitWithMetadata).toHaveBeenCalledWith(
      'lobby:ABCD',
      'player-left',
      expect.objectContaining({
        userId: user.id,
        reason: 'disconnect',
      })
    )
    expect(emitWithMetadata).toHaveBeenCalledWith(
      'lobby:ABCD',
      'lobby-update',
      expect.objectContaining({
        lobbyCode: 'ABCD',
        data: expect.objectContaining({
          disconnected: true,
          gameId: 'waiting-game-1',
        }),
      })
    )
    expect(io.to).toHaveBeenCalledWith('lobby-list')
  })
})
