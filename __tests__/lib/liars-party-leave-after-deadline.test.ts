// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
import { performPlayerLeave } from '@/lib/lobby-leave'
import { prisma } from '@/lib/db'
import { LiarsPartyGame } from '@/lib/games/liars-party-game'
import { appendGameReplaySnapshot } from '@/lib/game-replay'

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
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/in-app-notifications', () => ({
  deleteGameTurnReminderNotifications: jest.fn().mockResolvedValue(undefined),
}))

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any
const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']
const SNAPSHOT_UPDATED_AT = new Date('2026-10-26T10:00:00.000Z')

let clock = 1_000_000
let nowSpy: jest.SpyInstance<number, []>

function lobbyWith(state: unknown) {
  return {
    id: 'lobby-1',
    code: 'ABCD12',
    creatorId: 'p1',
    isActive: true,
    turnTimer: 60,
    games: [
      {
        id: 'game-1',
        status: 'playing',
        gameType: 'liars_party',
        state,
        currentTurn: 0,
        updatedAt: SNAPSHOT_UPDATED_AT,
        startedAt: new Date('2026-10-26T09:00:00.000Z'),
        players: IDS.map((id, i) => ({
          id: `row-${id}`,
          userId: id,
          position: i,
          createdAt: new Date('2026-10-26T09:00:00.000Z'),
          user: { id, username: id, bot: null },
        })),
      },
    ],
  }
}

describe("performPlayerLeave in Liar's Party after the vote clock ran out", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clock = 1_000_000
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
    ;(prisma.players.count as jest.Mock).mockResolvedValue(5)
    ;(prisma.players.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
    ;(prisma.games.update as jest.Mock).mockResolvedValue({})
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  })

  afterEach(() => nowSpy.mockRestore())

  it('closes the vote at its deadline with the lobby turn timer before the voter leaves', async () => {
    const game = new LiarsPartyGame('game-1', { maxPlayers: 12, minPlayers: 4, rules: { maxRounds: 10, eliminationStrikes: 2 } })
    for (const id of IDS) game.addPlayer({ id, name: id })
    game.startGame()
    const move = (playerId: string, type: string, data: Record<string, unknown>) =>
      expect(game.makeMove({ playerId, type, data, timestamp: new Date() })).toBe(true)
    move('p1', 'submit-claim', { claim: 'I have exactly five points', isBluff: true })
    for (const voter of ['p2', 'p3', 'p4']) move(voter, 'submit-challenge', { decision: 'challenge' })
    move('p6', 'submit-challenge', { decision: 'believe' })
    const deadline = (game.getState().lastMoveAt as number) + 60_000
    clock = deadline + 1_000

    await performPlayerLeave(lobbyWith(JSON.parse(JSON.stringify(game.getState()))) as any, 'ABCD12', 'p2', mockLog)

    const writes = (prisma.games.updateMany as jest.Mock).mock.calls
    expect(writes).toHaveLength(1)
    const written = writes[0][0].data.state
    expect(written.data.phase).toBe('reveal')
    expect(written.data.roundResults[0]).toEqual(expect.objectContaining({
      challengedBy: ['p2', 'p3', 'p4'],
      believedBy: ['p6', 'p5'],
      bluffCaught: true,
      resolvedAt: deadline,
    }))
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'game-1',
      actionType: 'liars_party:timeout-fallback',
      actionPayload: expect.objectContaining({ source: 'lobby-leave', autoSubmittedPlayerIds: ['p5'] }),
    }))
  })
})
