// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
import { performPlayerLeave } from '@/lib/lobby-leave'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: { update: jest.fn() },
    games: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    players: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(() => Promise.resolve(true)),
}))

jest.mock('@/lib/in-app-notifications', () => ({
  deleteGameTurnReminderNotifications: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/game-registry', () => ({
  restoreGameEngine: jest.fn(),
}))

jest.mock('@/lib/lobby-player-requirements', () => ({
  getLobbyPlayerRequirements: jest.fn(() => ({ minPlayersRequired: 2 })),
}))

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any

const HOST = 'user-host'

const waitingLobby = (players: Array<{ userId: string; bot: object | null }>) => ({
  id: 'lobby-1',
  code: '1704',
  creatorId: HOST,
  isActive: true,
  games: [
    {
      id: 'game-1',
      status: 'waiting',
      gameType: 'memory',
      state: null,
      currentTurn: 0,
      updatedAt: new Date('2026-09-25T10:00:00.000Z'),
      startedAt: null,
      players: players.map((p, i) => ({
        id: `p-${i}`,
        userId: p.userId,
        position: i,
        createdAt: new Date('2026-09-25T10:00:00.000Z'),
        user: { id: p.userId, username: p.userId, bot: p.bot },
      })),
    },
  ],
})

/**
 * #1198: leaving an empty waiting room deactivated the lobby but left its game
 * `waiting`. The open-lobby limit counts `waiting` games, so the host's next
 * POST /api/lobby answered 409 and sent them back into the dead room until the
 * stale-waiting sweep caught up, 30 minutes or more later.
 */
describe('host leaves a waiting room nobody else is in', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.players.delete as jest.Mock).mockResolvedValue({})
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  })

  it('cancels the waiting game along with deactivating the lobby', async () => {
    ;(prisma.players.count as jest.Mock).mockResolvedValue(0)

    const result = await performPlayerLeave(
      waitingLobby([{ userId: HOST, bot: null }]) as any,
      '1704',
      HOST,
      mockLog
    )

    expect(result.body.lobbyDeactivated).toBe(true)
    expect(prisma.lobbies.update).toHaveBeenCalledWith({
      where: { id: 'lobby-1' },
      data: { isActive: false },
    })
    // Guarded on `waiting`, so a start that landed in between is never undone.
    expect(prisma.games.updateMany).toHaveBeenCalledWith({
      where: { id: 'game-1', status: 'waiting' },
      data: { status: 'cancelled' },
    })
  })

  it('cancels it too when only bots are left behind', async () => {
    ;(prisma.players.count as jest.Mock)
      .mockResolvedValueOnce(1) // remaining players: the bot
      .mockResolvedValueOnce(0) // remaining humans

    await performPlayerLeave(
      waitingLobby([
        { userId: HOST, bot: null },
        { userId: 'bot-1', bot: { id: 'b1' } },
      ]) as any,
      '1704',
      HOST,
      mockLog
    )

    expect(prisma.games.updateMany).toHaveBeenCalledWith({
      where: { id: 'game-1', status: 'waiting' },
      data: { status: 'cancelled' },
    })
  })

  it('leaves the game alone while another person is still waiting', async () => {
    ;(prisma.players.count as jest.Mock).mockResolvedValue(1)
    ;(prisma.players.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.players.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await performPlayerLeave(
      waitingLobby([
        { userId: HOST, bot: null },
        { userId: 'user-other', bot: null },
      ]) as any,
      '1704',
      HOST,
      mockLog
    )

    expect(result.body.lobbyDeactivated).toBe(false)
    expect(prisma.games.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } })
    )
  })
})
