// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
import { performPlayerLeave } from '@/lib/lobby-leave'
import { prisma } from '@/lib/db'
import { broadcastToLobby } from '@/lib/supabase-server'
import { restoreGameEngine } from '@/lib/game-registry'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      update: jest.fn(),
    },
    games: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    players: {
      findFirst: jest.fn(),
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

// The seat requirement is not what is under test here; keep the game alive so
// the leave reaches its state write instead of abandoning the game.
jest.mock('@/lib/lobby-player-requirements', () => ({
  getLobbyPlayerRequirements: jest.fn(() => ({ minPlayersRequired: 2 })),
}))

const mockLog = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any

const LEAVER = 'user-leaver'
const STAYER = 'user-stayer'
const THIRD = 'user-third'
const SNAPSHOT_UPDATED_AT = new Date('2026-09-17T10:00:00.000Z')

const memoryState = (currentPlayerIndex: number) => ({
  id: 'game-1',
  gameType: 'memory',
  players: [
    { id: LEAVER, name: 'Leaver' },
    { id: STAYER, name: 'Stayer' },
    { id: THIRD, name: 'Third' },
  ],
  currentPlayerIndex,
  status: 'playing',
  data: { flippedCardIds: [], pendingMismatchCardIds: [], cards: [] },
  createdAt: '2026-09-17T09:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
})

const lobbyWithGame = (state: unknown, currentTurn = 12) => ({
  id: 'lobby-1',
  code: 'ABCD12',
  creatorId: STAYER,
  isActive: true,
  games: [
    {
      id: 'game-1',
      status: 'playing',
      gameType: 'memory',
      state,
      currentTurn,
      updatedAt: SNAPSHOT_UPDATED_AT,
      startedAt: new Date('2026-09-17T09:00:00.000Z'),
      players: [
        { id: 'p-leaver', userId: LEAVER, position: 0, createdAt: new Date('2026-09-17T09:00:00.000Z'), user: { id: LEAVER, username: 'Leaver', bot: null } },
        { id: 'p-stayer', userId: STAYER, position: 1, createdAt: new Date('2026-09-17T09:00:00.000Z'), user: { id: STAYER, username: 'Stayer', bot: null } },
        { id: 'p-third', userId: THIRD, position: 2, createdAt: new Date('2026-09-17T09:00:00.000Z'), user: { id: THIRD, username: 'Third', bot: null } },
      ],
    },
  ],
})

function stateWrites() {
  return (prisma.games.updateMany as jest.Mock).mock.calls
}

/**
 * #1001: the leave path applies its change to a snapshot the caller read several
 * round trips earlier. Writing that on the primary key alone put the pre-move
 * board back and broadcast it, so a move committed inside the window was gone.
 */
describe('performPlayerLeave game-state writes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.players.count as jest.Mock).mockResolvedValue(2)
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
    ;(broadcastToLobby as jest.Mock).mockResolvedValue(true)
  })

  it('advances the turn only while the row still carries the revision it read', async () => {
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })

    await performPlayerLeave(lobbyWithGame(memoryState(0)) as any, 'ABCD12', LEAVER, mockLog)

    // The unguarded write is the defect — it must be gone, not merely guarded elsewhere.
    expect(prisma.games.update).not.toHaveBeenCalled()
    expect(stateWrites()).toHaveLength(1)
    expect(stateWrites()[0][0].where).toEqual({
      id: 'game-1',
      currentTurn: 12,
      updatedAt: SNAPSHOT_UPDATED_AT,
    })
    expect(stateWrites()[0][0].data.state.currentPlayerIndex).toBe(1)
  })

  it('does not replay its snapshot when a move committed first', async () => {
    // The move advanced the turn off the departed player, so once the leave
    // re-reads the row there is nothing left for it to do.
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
      state: memoryState(1),
      currentTurn: 13,
      updatedAt: new Date('2026-09-17T10:00:01.000Z'),
    })

    await performPlayerLeave(lobbyWithGame(memoryState(0)) as any, 'ABCD12', LEAVER, mockLog)

    expect(stateWrites()).toHaveLength(1)
    expect(
      (broadcastToLobby as jest.Mock).mock.calls.filter(([, event]) => event === 'game-update')
    ).toHaveLength(0)
  })

  it('re-derives the engine leave from the row that is actually there', async () => {
    // Alias and Liar's Party hand the leave to the engine; a lost race must
    // re-run it against the committed state, never re-send the stale one.
    ;(restoreGameEngine as jest.Mock).mockImplementation((_type, _id, rawState) => ({
      handlePlayerLeave: () => true,
      getState: () => ({ ...(rawState as Record<string, unknown>), leaveApplied: true }),
    }))
    ;(prisma.games.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 })
    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
      state: { ...memoryState(1), tappedWords: 3 },
      currentTurn: 13,
      updatedAt: new Date('2026-09-17T10:00:01.000Z'),
    })

    const lobby = lobbyWithGame(memoryState(0))
    lobby.games[0].gameType = 'alias'

    await performPlayerLeave(lobby as any, 'ABCD12', LEAVER, mockLog)

    expect(stateWrites()).toHaveLength(2)
    expect(stateWrites()[1][0].where).toEqual({
      id: 'game-1',
      currentTurn: 13,
      updatedAt: new Date('2026-09-17T10:00:01.000Z'),
    })
    // The word the describer tapped while the leave was in flight survives.
    expect(stateWrites()[1][0].data.state.tappedWords).toBe(3)
    expect(stateWrites()[1][0].data.state.leaveApplied).toBe(true)
  })
})
