// @ts-nocheck

import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    games: {
      updateMany: jest.fn(),
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
  })

  it('deactivates lobbies without active waiting/playing games', async () => {
    mockPrisma.lobbies.findMany.mockResolvedValue([
      {
        id: 'lobby-empty',
        code: 'EMPTY1',
        games: [],
      },
    ] as any)
    mockPrisma.lobbies.updateMany.mockResolvedValue({ count: 1 } as any)

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
    mockPrisma.lobbies.updateMany.mockResolvedValue({ count: 2 } as any)

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
})
