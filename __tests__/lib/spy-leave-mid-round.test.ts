// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
/**
 * #1263: a non-spy leaving a running Guess the Spy game must stop holding the
 * round open, and the leave's broadcast must not carry the round's secrets. The
 * spy leaving still abandons the game, as before.
 */
import { performPlayerLeave } from '@/lib/lobby-leave'
import { prisma } from '@/lib/db'
import { broadcastToLobby } from '@/lib/supabase-server'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'

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

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any
const IDS = ['user-1', 'user-2', 'user-3', 'user-4']
const SNAPSHOT_UPDATED_AT = new Date('2026-09-28T10:00:00.000Z')

function votingGame() {
  const game = new SpyGame('game-1')
  for (const id of IDS) game.addPlayer({ id, name: id })
  game.startGame()
  game.initializeRound([{ name: 'Airport', category: 'Travel', roles: ['Pilot', 'Passenger', 'Guard', 'Mechanic'] }])
  for (const id of IDS) game.makeMove({ playerId: id, type: 'player-ready', data: {}, timestamp: new Date() })
  game.makeMove({ playerId: 'user-1', type: 'start-voting', data: {}, timestamp: new Date() })
  return game
}

function lobbyWith(state: unknown, creatorId = 'user-1') {
  return {
    id: 'lobby-1',
    code: 'ABCD12',
    creatorId,
    isActive: true,
    games: [
      {
        id: 'game-1',
        status: 'playing',
        gameType: 'guess_the_spy',
        state,
        currentTurn: 0,
        updatedAt: SNAPSHOT_UPDATED_AT,
        startedAt: new Date('2026-09-28T09:00:00.000Z'),
        players: IDS.map((id, i) => ({
          id: `p-${id}`,
          userId: id,
          position: i,
          createdAt: new Date('2026-09-28T09:00:00.000Z'),
          user: { id, username: id, bot: null },
        })),
      },
    ],
  }
}

describe('performPlayerLeave in Guess the Spy (#1263)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Three players stay: at the game's minimum, so the leave does not abandon it.
    ;(prisma.players.count as jest.Mock).mockResolvedValue(3)
    ;(prisma.players.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
    ;(prisma.games.update as jest.Mock).mockResolvedValue({})
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  })

  it('closes the vote when the non-spy who left was the last one it waited for', async () => {
    const game = votingGame()
    const spy = (game.getState().data as any).spyPlayerId
    const leaver = IDS.find((id) => id !== spy && id !== 'user-1')!
    const stayers = IDS.filter((id) => id !== leaver)
    for (const voter of stayers) {
      game.makeMove({ playerId: voter, type: 'vote', data: { targetId: stayers.find((id) => id !== voter) }, timestamp: new Date() })
    }
    expect((game.getState().data as any).phase).toBe(SpyGamePhase.VOTING)

    const result = await performPlayerLeave(lobbyWith(game.getState()) as any, 'ABCD12', leaver, mockLog)

    expect(result.body.gameAbandoned).toBeUndefined()
    const writes = (prisma.games.updateMany as jest.Mock).mock.calls
    expect(writes).toHaveLength(1)
    const written = writes[0][0].data.state
    expect(written.players.find((p) => p.id === leaver).isActive).toBe(false)
    expect(written.data.phase).toBe(SpyGamePhase.RESULTS)
  })

  it('broadcasts the leave without the spy, the roles or the location mid-round', async () => {
    const game = votingGame()
    const spy = (game.getState().data as any).spyPlayerId
    const leaver = IDS.find((id) => id !== spy)!

    await performPlayerLeave(lobbyWith(game.getState()) as any, 'ABCD12', leaver, mockLog)

    const updates = (broadcastToLobby as jest.Mock).mock.calls.filter(([, event]) => event === 'game-update')
    expect(updates).toHaveLength(1)
    const broadcast = updates[0][2].payload
    expect(broadcast.data.phase).toBe(SpyGamePhase.VOTING)
    expect(broadcast.data.spyPlayerId).toBeUndefined()
    expect(broadcast.data.playerRoles).toBeUndefined()
    expect(broadcast.data.location).toBeUndefined()
    expect(broadcast.players.find((p) => p.id === leaver).isActive).toBe(false)
  })

  it('still abandons the game when the spy is the one who leaves', async () => {
    const game = votingGame()
    const spy = (game.getState().data as any).spyPlayerId

    const result = await performPlayerLeave(lobbyWith(game.getState()) as any, 'ABCD12', spy, mockLog)

    expect(result.body.gameAbandoned).toBe(true)
    expect(prisma.games.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'abandoned', terminalMetadata: { outcome: 'abandoned', reason: 'spy_left' } }),
      })
    )
    expect(prisma.games.updateMany).not.toHaveBeenCalled()
  })

  it('still abandons the game when the leave drops it under three players', async () => {
    ;(prisma.players.count as jest.Mock).mockResolvedValue(2)
    const game = votingGame()
    const spy = (game.getState().data as any).spyPlayerId
    const leaver = IDS.find((id) => id !== spy)!

    const result = await performPlayerLeave(lobbyWith(game.getState()) as any, 'ABCD12', leaver, mockLog)

    expect(result.body.gameAbandoned).toBe(true)
    expect(prisma.games.updateMany).not.toHaveBeenCalled()
  })
})
