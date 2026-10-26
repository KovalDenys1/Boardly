// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
import { performPlayerLeave } from '@/lib/lobby-leave'
import { prisma } from '@/lib/db'
import { broadcastToLobby } from '@/lib/supabase-server'
import { restoreGameEngine } from '@/lib/game-registry'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: { update: jest.fn() },
    games: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    players: { findFirst: jest.fn(), findMany: jest.fn(), delete: jest.fn(), update: jest.fn(), count: jest.fn() },
  },
}))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn(() => Promise.resolve(true)) }))
jest.mock('@/lib/in-app-notifications', () => ({ deleteGameTurnReminderNotifications: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/game-registry', () => ({ restoreGameEngine: jest.fn() }))
jest.mock('@/lib/lobby-player-requirements', () => ({ getLobbyPlayerRequirements: jest.fn(() => ({ minPlayersRequired: 2 })) }))

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any
const LEAVER = 'user-leaver'
const STAYER = 'user-stayer'
const THIRD = 'user-third'
const ROW_ID = 'row-7'
const STARTED = new Date('2026-10-26T09:00:00.000Z')

// The engine names its state `game_<ts>` (POST /api/game/create); only the row id tells a rematch apart.
const engineState = (gameType: string) => ({
  id: 'game_1761469200000',
  gameType,
  players: [
    { id: LEAVER, name: 'Leaver' },
    { id: STAYER, name: 'Stayer' },
    { id: THIRD, name: 'Third' },
  ],
  currentPlayerIndex: 0,
  status: 'playing',
  data: { flippedCardIds: [], pendingMismatchCardIds: [], cards: [] },
  lastMoveAt: STARTED.getTime(),
  createdAt: '2026-10-26T09:00:00.000Z',
  updatedAt: '2026-10-26T10:00:00.000Z',
})

const lobbyWith = (gameType: string) => ({
  id: 'lobby-1',
  code: 'ABCD12',
  creatorId: STAYER,
  isActive: true,
  games: [
    {
      id: ROW_ID,
      status: 'playing',
      gameType,
      state: engineState(gameType),
      currentTurn: 4,
      updatedAt: new Date('2026-10-26T10:00:00.000Z'),
      startedAt: STARTED,
      players: [LEAVER, STAYER, THIRD].map((userId, position) => ({
        id: `p-${userId}`,
        userId,
        position,
        createdAt: STARTED,
        user: { id: userId, username: userId, bot: null },
      })),
    },
  ],
})

const gameUpdates = () => (broadcastToLobby as jest.Mock).mock.calls.filter(([, event]) => event === 'game-update').map(([, , data]) => data)

// #1528: a frame tagged with its game row is never applied to another game on screen (#1521).
// The two leave frames were the untagged ones, so a rematch's page took a finished game's leave.
describe('the game-update frames a leave sends name their game row (#1528)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.players.count as jest.Mock).mockResolvedValue(2)
    ;(prisma.players.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  })

  it('when the leave moves the turn on', async () => {
    await performPlayerLeave(lobbyWith('memory') as any, 'ABCD12', LEAVER, mockLog)

    expect(gameUpdates()).toHaveLength(1)
    expect(gameUpdates()[0].gameId).toBe(ROW_ID)
  })

  it('when the engine handles the leave', async () => {
    ;(restoreGameEngine as jest.Mock).mockImplementation((_type, _id, rawState) => ({
      handlePlayerLeave: () => true,
      getState: () => rawState,
    }))

    await performPlayerLeave(lobbyWith('alias') as any, 'ABCD12', LEAVER, mockLog)

    expect(gameUpdates()).toHaveLength(1)
    expect(gameUpdates()[0].gameId).toBe(ROW_ID)
  })

  // The page judges a player-left frame by when each player left (#1528 review 2).
  it('the player-left frame carries the time the leave was written', async () => {
    await performPlayerLeave(lobbyWith('memory') as any, 'ABCD12', LEAVER, mockLog)

    const written = (prisma.players.update as jest.Mock).mock.calls.map(([args]) => args.data?.leftAt).find(Boolean)
    const frames = (broadcastToLobby as jest.Mock).mock.calls.filter(([, event]) => event === 'player-left').map(([, , data]) => data)
    expect(written).toBeInstanceOf(Date)
    expect(frames).toHaveLength(1)
    expect(frames[0].leftAt).toBe(written.toISOString())
  })
})
