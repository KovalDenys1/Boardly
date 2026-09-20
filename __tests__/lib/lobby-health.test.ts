// @ts-nocheck

import { cleanupStaleLobbiesAndGames, sweepStaleLobbiesIfDue } from '@/lib/lobby-health'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    games: {
      updateMany: jest.fn(),
      count: jest.fn(),
      // Prisma field references, used by the #1048 recurrence counter to compare
      // two columns of the same row.
      fields: {
        startedAt: 'Games.startedAt',
      },
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('cleanupStaleLobbiesAndGames', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.lobbies.findMany.mockResolvedValue([])
    mockPrisma.lobbies.updateMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.games.updateMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.games.count.mockResolvedValue(0 as any)
  })

  it('deactivates lobbies without active waiting/playing games', async () => {
    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-empty',
        code: 'EMPTY1',
        games: [],
      },
    ] as any)
    mockPrisma.lobbies.updateMany
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 0 } as any)
    mockPrisma.games.updateMany
      .mockResolvedValueOnce({ count: 0 } as any)
      .mockResolvedValueOnce({ count: 0 } as any)

    const result = await cleanupStaleLobbiesAndGames({
      now: new Date('2026-02-27T21:00:00.000Z'),
    })

    expect(result.success).toBe(true)
    expect(result.scannedLobbies).toBe(1)
    expect(result.scannedActiveGames).toBe(0)
    expect(result.deactivatedLobbies).toBe(1)
    expect(result.cancelledWaitingGames).toBe(0)
    expect(result.abandonedPlayingGames).toBe(0)
    expect(mockPrisma.lobbies.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['lobby-empty'] },
        }),
      })
    )
  })

  it('cancels stale waiting games and abandons stale playing games', async () => {
    const now = new Date('2026-02-27T21:00:00.000Z')
    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-waiting',
        code: 'WAIT1',
        games: [
          {
            id: 'game-waiting',
            status: 'waiting',
            updatedAt: new Date('2026-02-27T18:30:00.000Z'),
            players: [
              {
                leftAt: null,
                lastHeartbeatAt: new Date('2026-02-27T18:30:00.000Z'),
                user: { bot: null },
              },
            ],
          },
        ],
      },
      {
        id: 'lobby-playing',
        code: 'PLAY1',
        games: [
          {
            id: 'game-playing',
            status: 'playing',
            updatedAt: new Date('2026-02-27T17:30:00.000Z'),
            players: [
              {
                leftAt: null,
                lastHeartbeatAt: new Date('2026-02-27T17:30:00.000Z'),
                user: { bot: null },
              },
            ],
          },
        ],
      },
    ] as any)
    mockPrisma.games.updateMany
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 1 } as any)
      .mockResolvedValueOnce({ count: 0 } as any)
      .mockResolvedValueOnce({ count: 0 } as any)
    mockPrisma.lobbies.updateMany
      .mockResolvedValueOnce({ count: 2 } as any)
      .mockResolvedValueOnce({ count: 0 } as any)

    const result = await cleanupStaleLobbiesAndGames({
      now,
      waitingStaleHours: 1,
      playingStaleHours: 2,
    })

    expect(result.scannedLobbies).toBe(2)
    expect(result.scannedActiveGames).toBe(2)
    expect(result.cancelledWaitingGames).toBe(1)
    expect(result.abandonedPlayingGames).toBe(1)
    expect(result.deactivatedLobbies).toBe(2)

    expect(mockPrisma.games.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['game-waiting'] },
          status: 'waiting',
        }),
        data: { status: 'cancelled' },
      })
    )

    expect(mockPrisma.games.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['game-playing'] },
          status: 'playing',
        }),
        data: expect.objectContaining({
          status: 'abandoned',
          abandonedAt: now,
        }),
      })
    )
  })

  it('finalizes stale games globally even when per-lobby scan is empty', async () => {
    mockPrisma.lobbies.findMany.mockResolvedValue([] as any)
    mockPrisma.games.updateMany
      .mockResolvedValueOnce({ count: 2 } as any)
      .mockResolvedValueOnce({ count: 3 } as any)
    mockPrisma.lobbies.updateMany.mockResolvedValueOnce({ count: 4 } as any)

    const result = await cleanupStaleLobbiesAndGames({
      now: new Date('2026-02-27T21:00:00.000Z'),
      waitingStaleHours: 1,
      playingStaleHours: 2,
    })

    expect(result.scannedLobbies).toBe(0)
    expect(result.scannedActiveGames).toBe(0)
    expect(result.cancelledWaitingGames).toBe(2)
    expect(result.abandonedPlayingGames).toBe(3)
    expect(result.deactivatedLobbies).toBe(4)

    expect(mockPrisma.games.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'waiting',
        }),
        data: expect.objectContaining({
          status: 'cancelled',
        }),
      })
    )

    expect(mockPrisma.games.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'playing',
        }),
        data: expect.objectContaining({
          status: 'abandoned',
        }),
      })
    )
  })

  it('keeps a waiting room whose players are still heartbeating (#1003)', async () => {
    // Four friends gathering for a party game write Players rows and nothing else,
    // so games.updatedAt is stuck at lobby creation. Row age alone used to evict all
    // of them 30 minutes in, mid-chat.
    const now = new Date('2026-02-27T21:00:00.000Z')
    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-gathering',
        code: 'PARTY1',
        games: [
          {
            id: 'game-gathering',
            status: 'waiting',
            updatedAt: new Date('2026-02-27T19:00:00.000Z'),
            players: [
              {
                leftAt: null,
                lastHeartbeatAt: new Date('2026-02-27T20:59:55.000Z'),
                user: { bot: null },
              },
              {
                leftAt: null,
                lastHeartbeatAt: new Date('2026-02-27T20:59:52.000Z'),
                user: { bot: null },
              },
            ],
          },
        ],
      },
    ] as any)

    const result = await cleanupStaleLobbiesAndGames({ now, waitingStaleHours: 0.5 })

    expect(result.scannedActiveGames).toBe(1)
    expect(result.cancelledWaitingGames).toBe(0)
    expect(mockPrisma.games.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['game-gathering'] } }),
      })
    )
    expect(mockPrisma.lobbies.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['lobby-gathering'] } }),
      })
    )
  })

  it('still cancels a waiting room everyone has walked away from (#1003)', async () => {
    const now = new Date('2026-02-27T21:00:00.000Z')
    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-abandoned',
        code: 'GONE01',
        games: [
          {
            id: 'game-abandoned',
            status: 'waiting',
            updatedAt: new Date('2026-02-27T19:00:00.000Z'),
            players: [
              {
                leftAt: null,
                lastHeartbeatAt: new Date('2026-02-27T19:05:00.000Z'),
                user: { bot: null },
              },
            ],
          },
        ],
      },
    ] as any)
    mockPrisma.games.updateMany.mockResolvedValueOnce({ count: 1 } as any)

    const result = await cleanupStaleLobbiesAndGames({ now, waitingStaleHours: 0.5 })

    expect(result.cancelledWaitingGames).toBe(1)
    expect(mockPrisma.games.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['game-abandoned'] }, status: 'waiting' }),
        data: { status: 'cancelled' },
      })
    )
  })

  it('a bot left alone in the room does not keep it alive (#1003)', async () => {
    const now = new Date('2026-02-27T21:00:00.000Z')
    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-bot-only',
        code: 'BOT001',
        games: [
          {
            id: 'game-bot-only',
            status: 'waiting',
            updatedAt: new Date('2026-02-27T20:59:00.000Z'),
            players: [
              {
                leftAt: null,
                lastHeartbeatAt: new Date('2026-02-27T20:59:58.000Z'),
                user: { bot: { id: 'bot-1' } },
              },
            ],
          },
        ],
      },
    ] as any)
    mockPrisma.games.updateMany.mockResolvedValueOnce({ count: 1 } as any)

    const result = await cleanupStaleLobbiesAndGames({ now, waitingStaleHours: 0.5 })

    expect(result.cancelledWaitingGames).toBe(1)
  })

  it('the global backstop skips waiting games someone is still sitting in (#1003)', async () => {
    mockPrisma.lobbies.findMany.mockResolvedValue([] as any)

    await cleanupStaleLobbiesAndGames({
      now: new Date('2026-02-27T21:00:00.000Z'),
      waitingStaleHours: 1,
      playingStaleHours: 2,
    })

    // The backstop never joins Players, so without this condition it re-cancelled
    // exactly the rooms the per-lobby branch had just spared.
    expect(mockPrisma.games.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'waiting',
          players: {
            none: {
              leftAt: null,
              lastHeartbeatAt: { gt: new Date('2026-02-27T20:59:30.000Z') },
            },
          },
        }),
      })
    )
  })

  it('the global backstop will not abandon a game that only just started (#1048)', async () => {
    mockPrisma.lobbies.findMany.mockResolvedValue([] as any)

    await cleanupStaleLobbiesAndGames({
      now: new Date('2026-02-27T21:00:00.000Z'),
      waitingStaleHours: 1,
      playingStaleHours: 2,
    })

    const cutoff = new Date('2026-02-27T19:00:00.000Z')
    const playingCall = mockPrisma.games.updateMany.mock.calls[1][0] as any

    expect(playingCall.where.status).toBe('playing')
    // lastMoveAt is seeded on the waiting row by its column default, so on its own
    // it says how long the lobby had been open, not how long the game has been
    // idle. Rows written before #1048 still carry that value while playing, and
    // unbounded this clause abandoned them the moment they started.
    expect(playingCall.where.OR).toContainEqual({
      AND: [
        { lastMoveAt: { lte: cutoff } },
        { OR: [{ startedAt: null }, { startedAt: { lte: cutoff } }] },
      ],
    })
    expect(playingCall.where.OR).toContainEqual({ updatedAt: { lte: cutoff } })
    // A bare lastMoveAt test is the defect itself.
    expect(playingCall.where.OR).not.toContainEqual({ lastMoveAt: { lte: cutoff } })
  })

  it('counts playing games whose move clock predates their start (#1048)', async () => {
    mockPrisma.lobbies.findMany.mockResolvedValue([] as any)
    mockPrisma.games.count.mockResolvedValue(3 as any)

    const result = await cleanupStaleLobbiesAndGames({
      now: new Date('2026-02-27T21:00:00.000Z'),
      playingStaleHours: 2,
    })

    // Without this the next regression is invisible until somebody runs a
    // 30-day query and reads the negative medians as lost players.
    expect(result.playingGamesWithPreStartMoveClock).toBe(3)
    expect(mockPrisma.games.count).toHaveBeenCalledWith({
      where: {
        status: 'playing',
        startedAt: { not: null },
        lastMoveAt: { lte: 'Games.startedAt' },
      },
    })
  })
})

describe('sweepStaleLobbiesIfDue (#806)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.lobbies.findMany.mockResolvedValue([])
  })

  it('sweeps once and then throttles, so a busy list does not sweep per request', async () => {
    // The scheduled sweep runs on a GitHub cron asking for every five minutes
    // that in practice fired five times in a day, so the read path settles
    // staleness itself — but it must not do so on every single request.
    await sweepStaleLobbiesIfDue()
    const afterFirst = mockPrisma.lobbies.findMany.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)

    await sweepStaleLobbiesIfDue()
    await sweepStaleLobbiesIfDue()
    expect(mockPrisma.lobbies.findMany.mock.calls.length).toBe(afterFirst)
  })

  it('swallows a janitor failure rather than breaking the page it runs under', async () => {
    jest.advanceTimersByTime?.(0)
    mockPrisma.lobbies.findMany.mockRejectedValue(new Error('db down'))
    await expect(sweepStaleLobbiesIfDue()).resolves.toBeUndefined()
  })
})
