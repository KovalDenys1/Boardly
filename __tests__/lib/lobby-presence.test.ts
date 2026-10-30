// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
import { sweepStalePlayers, HEARTBEAT_STALE_THRESHOLD_MS } from '@/lib/lobby-presence'
import { prisma } from '@/lib/db'
import { performPlayerLeave } from '@/lib/lobby-leave'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
    },
    players: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  },
}))

jest.mock('@/lib/lobby-leave', () => ({
  LOBBY_WITH_GAMES_FOR_LEAVE_INCLUDE: {},
  performPlayerLeave: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockPerformPlayerLeave = performPlayerLeave as jest.MockedFunction<typeof performPlayerLeave>

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any

function player(overrides: Partial<{
  userId: string
  leftAt: Date | null
  lastHeartbeatAt: Date
  bot: unknown
}> = {}) {
  return {
    userId: overrides.userId ?? 'user-1',
    leftAt: overrides.leftAt ?? null,
    lastHeartbeatAt: overrides.lastHeartbeatAt ?? new Date(),
    user: { bot: overrides.bot ?? null },
  }
}

const FRESH = new Date()
const STALE = new Date(Date.now() - HEARTBEAT_STALE_THRESHOLD_MS - 1_000)

describe('sweepStalePlayers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does nothing when every player has a fresh heartbeat', async () => {
    const game = { id: 'game-1', players: [player({ lastHeartbeatAt: FRESH })] }

    const result = await sweepStalePlayers(game, 'ABCD', mockLog)

    expect(result).toEqual({ removedUserIds: [], gameAbandoned: false })
    expect(mockPrisma.lobbies.findUnique).not.toHaveBeenCalled()
    expect(mockPerformPlayerLeave).not.toHaveBeenCalled()
  })

  it('ignores bot players regardless of heartbeat age', async () => {
    const game = { id: 'game-1', players: [player({ lastHeartbeatAt: STALE, bot: { difficulty: 'medium' } })] }

    const result = await sweepStalePlayers(game, 'ABCD', mockLog)

    expect(result.removedUserIds).toEqual([])
    expect(mockPerformPlayerLeave).not.toHaveBeenCalled()
  })

  it('ignores players who already left', async () => {
    const game = { id: 'game-1', players: [player({ lastHeartbeatAt: STALE, leftAt: new Date() })] }

    const result = await sweepStalePlayers(game, 'ABCD', mockLog)

    expect(result.removedUserIds).toEqual([])
    expect(mockPerformPlayerLeave).not.toHaveBeenCalled()
  })

  it('removes a genuinely stale non-bot player and propagates gameAbandoned', async () => {
    const game = { id: 'game-1', players: [player({ userId: 'user-stale', lastHeartbeatAt: STALE })] }
    const refetchedLobby = {
      games: [
        {
          id: 'game-1',
          players: [{ userId: 'user-stale', leftAt: null }],
        },
      ],
    }
    mockPrisma.lobbies.findUnique.mockResolvedValue(refetchedLobby as never)
    mockPerformPlayerLeave.mockResolvedValue({
      status: 200,
      body: { message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true },
    })

    const result = await sweepStalePlayers(game, 'ABCD', mockLog)

    expect(mockPerformPlayerLeave).toHaveBeenCalledWith(refetchedLobby, 'ABCD', 'user-stale', mockLog)
    expect(result).toEqual({ removedUserIds: ['user-stale'], gameAbandoned: true })
  })

  it('skips a stale player who was already removed by a concurrent request', async () => {
    const game = { id: 'game-1', players: [player({ userId: 'user-stale', lastHeartbeatAt: STALE })] }
    // Re-fetch shows the player is no longer in the game (already left/swept elsewhere).
    const refetchedLobby = { games: [{ id: 'game-1', players: [] }] }
    mockPrisma.lobbies.findUnique.mockResolvedValue(refetchedLobby as never)

    const result = await sweepStalePlayers(game, 'ABCD', mockLog)

    expect(mockPerformPlayerLeave).not.toHaveBeenCalled()
    expect(result).toEqual({ removedUserIds: [], gameAbandoned: false })
  })

  it('logs and continues if performPlayerLeave throws for one stale player', async () => {
    const game = {
      id: 'game-1',
      players: [
        player({ userId: 'user-a', lastHeartbeatAt: STALE }),
        player({ userId: 'user-b', lastHeartbeatAt: STALE }),
      ],
    }
    const refetchedLobby = {
      games: [
        {
          id: 'game-1',
          players: [
            { userId: 'user-a', leftAt: null },
            { userId: 'user-b', leftAt: null },
          ],
        },
      ],
    }
    mockPrisma.lobbies.findUnique.mockResolvedValue(refetchedLobby as never)
    mockPerformPlayerLeave
      .mockRejectedValueOnce(new Error('db exploded'))
      .mockResolvedValueOnce({
        status: 200,
        body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: false },
      })

    const result = await sweepStalePlayers(game, 'ABCD', mockLog)

    expect(result.removedUserIds).toEqual(['user-b'])
    expect(mockLog.warn).toHaveBeenCalledWith(
      'Failed to sweep stale player',
      expect.objectContaining({ userId: 'user-a' })
    )
  })

  // #1600: a host back from a background tab reads the lobby before the next heartbeat lands.
  it('keeps the player whose own request is reading the lobby, however old their heartbeat', async () => {
    const game = {
      id: 'game-1',
      players: [
        player({ userId: 'user-host', lastHeartbeatAt: new Date(Date.now() - 2 * 60_000) }),
        player({ userId: 'user-gone', lastHeartbeatAt: STALE }),
      ],
    }
    const refetchedLobby = {
      games: [
        {
          id: 'game-1',
          players: [
            { userId: 'user-host', leftAt: null },
            { userId: 'user-gone', leftAt: null },
          ],
        },
      ],
    }
    mockPrisma.lobbies.findUnique.mockResolvedValue(refetchedLobby as never)
    mockPerformPlayerLeave.mockResolvedValue({
      status: 200,
      body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: false },
    })

    const result = await sweepStalePlayers(game, 'ABCD', mockLog, { presentUserId: 'user-host' })

    expect(result.removedUserIds).toEqual(['user-gone'])
    expect(mockPerformPlayerLeave).toHaveBeenCalledTimes(1)
    expect(mockPerformPlayerLeave).toHaveBeenCalledWith(refetchedLobby, 'ABCD', 'user-gone', mockLog)
    expect(mockPrisma.players.updateMany).toHaveBeenCalledWith({
      where: { gameId: 'game-1', userId: 'user-host', leftAt: null },
      data: { lastHeartbeatAt: expect.any(Date) },
    })
  })

  it('writes nothing for a present player whose heartbeat is still fresh', async () => {
    const game = { id: 'game-1', players: [player({ userId: 'user-host', lastHeartbeatAt: FRESH })] }

    const result = await sweepStalePlayers(game, 'ABCD', mockLog, { presentUserId: 'user-host' })

    expect(result).toEqual({ removedUserIds: [], gameAbandoned: false })
    expect(mockPrisma.players.updateMany).not.toHaveBeenCalled()
  })
})
