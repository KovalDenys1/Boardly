import { commitGameState } from '@/lib/game-state-lock'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      updateMany: jest.fn(),
    },
  },
}))

const mockUpdateMany = prisma.games.updateMany as jest.Mock

/**
 * #993/#1001: every writer of Games.state outside the move route used to write
 * on the primary key alone, so a stale snapshot overwrote whatever had been
 * committed since it was read.
 */
describe('commitGameState', () => {
  const revision = { currentTurn: 4, updatedAt: new Date('2026-09-17T10:00:00.000Z') }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('conditions the write on the revision it read and stamps a new one', async () => {
    mockUpdateMany.mockResolvedValue({ count: 1 })

    const next = await commitGameState({
      gameId: 'game-1',
      revision,
      data: { status: 'playing' },
    })

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'game-1', currentTurn: 4, updatedAt: revision.updatedAt },
      data: expect.objectContaining({ status: 'playing' }),
    })

    const written = mockUpdateMany.mock.calls[0][0].data.updatedAt as Date
    expect(written).toBeInstanceOf(Date)
    expect(written.getTime()).not.toBe(revision.updatedAt.getTime())
    // The returned revision is what a second write in the same request locks on.
    expect(next).toEqual({ currentTurn: 4, updatedAt: written })
  })

  it('reports the loss instead of writing when somebody else committed first', async () => {
    mockUpdateMany.mockResolvedValue({ count: 0 })

    const next = await commitGameState({
      gameId: 'game-1',
      revision,
      data: { status: 'playing' },
    })

    expect(next).toBeNull()
  })
})
