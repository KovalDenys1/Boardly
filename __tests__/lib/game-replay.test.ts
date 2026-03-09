// @ts-nocheck

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    warn: jest.fn(),
  })),
}))

import { prisma } from '@/lib/db'
import { appendGameReplaySnapshot, decodeGameReplaySnapshots } from '@/lib/game-replay'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('game replay helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('compresses replay state asynchronously and keeps snapshots decodable', async () => {
    const tx = {
      gameStateSnapshots: {
        findFirst: jest.fn().mockResolvedValue({ turnNumber: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'snapshot-3' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'snapshot-0' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }

    mockPrisma.$transaction.mockImplementation(async (callback: any) => callback(tx))

    await appendGameReplaySnapshot({
      gameId: 'game-1',
      actionType: 'move:submit',
      actionPayload: { cell: 4 },
      state: {
        gameType: 'tic_tac_toe',
        board: ['X', null, 'O'],
        currentPlayerIndex: 1,
      },
    })

    expect(tx.gameStateSnapshots.create).toHaveBeenCalledTimes(1)
    expect(tx.gameStateSnapshots.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['snapshot-0'],
        },
      },
    })

    const createArgs = tx.gameStateSnapshots.create.mock.calls[0][0]
    expect(createArgs.data.turnNumber).toBe(3)
    expect(createArgs.data.stateEncoding).toBe('gzip-base64')
    expect(createArgs.data.stateSize).toBeGreaterThan(0)
    expect(typeof createArgs.data.stateCompressed).toBe('string')
    expect(createArgs.data.stateCompressed).not.toContain('"board"')

    const decoded = decodeGameReplaySnapshots([
      {
        id: 'snapshot-3',
        turnNumber: createArgs.data.turnNumber,
        playerId: null,
        actionType: 'move:submit',
        actionPayload: { cell: 4 },
        stateCompressed: createArgs.data.stateCompressed,
        stateEncoding: createArgs.data.stateEncoding,
        createdAt: new Date('2026-03-09T12:00:00.000Z'),
      },
    ])

    expect(decoded[0]).toMatchObject({
      id: 'snapshot-3',
      actionType: 'move:submit',
      state: {
        gameType: 'tic_tac_toe',
        board: ['X', null, 'O'],
        currentPlayerIndex: 1,
      },
    })
  })
})
