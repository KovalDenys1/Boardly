// @ts-nocheck - Jest mocks for Prisma are complex to type (matches __tests__/api/lobby-leave.test.ts convention)
import { performPlayerLeave } from '@/lib/lobby-leave'
import { prisma } from '@/lib/db'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'
import { AliasGame } from '@/lib/games/alias'
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
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/in-app-notifications', () => ({
  deleteGameTurnReminderNotifications: jest.fn().mockResolvedValue(undefined),
}))

const mockLog = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as any
const SNAPSHOT_UPDATED_AT = new Date('2026-10-29T10:00:00.000Z')

let clock = 1_000_000
let nowSpy: jest.SpyInstance<number, []>

function lobbyWith(gameType: string, ids: string[], state: unknown) {
  return {
    id: 'lobby-1',
    code: 'ABCD12',
    creatorId: ids[0],
    isActive: true,
    turnTimer: 60,
    games: [
      {
        id: 'game-1',
        status: 'playing',
        gameType,
        state,
        currentTurn: 0,
        updatedAt: SNAPSHOT_UPDATED_AT,
        startedAt: new Date('2026-10-29T09:00:00.000Z'),
        players: ids.map((id, i) => ({
          id: `row-${id}`,
          userId: id,
          position: i,
          score: 0,
          scorecard: null,
          finalScore: null,
          placement: null,
          isWinner: false,
          createdAt: new Date('2026-10-29T09:00:00.000Z'),
          user: { id, username: id, bot: null },
        })),
      },
    ],
  }
}

function writtenData() {
  const writes = (prisma.games.updateMany as jest.Mock).mock.calls
  expect(writes).toHaveLength(1)
  return writes[0][0].data
}

beforeEach(() => {
  jest.clearAllMocks()
  clock = 1_000_000
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
  ;(prisma.players.count as jest.Mock).mockResolvedValue(3)
  ;(prisma.players.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.players.update as jest.Mock).mockResolvedValue({})
  ;(prisma.lobbies.update as jest.Mock).mockResolvedValue({})
  ;(prisma.games.update as jest.Mock).mockResolvedValue({})
  ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
})

afterEach(() => nowSpy.mockRestore())

describe('a Guess the Spy leave after the vote clock ran out', () => {
  const IDS = ['host', 'late', 'third', 'spy']

  /** host and third vote for the spy, the spy for host; `late` has not voted. */
  function lapsedVote(round?: number) {
    const game = new SpyGame('game-1')
    for (const id of IDS) game.addPlayer({ id, name: id })
    game.startGame()
    game.initializeRound([{ name: 'Airport', category: 'Travel', roles: ['Pilot', 'Passenger', 'Guard', 'Mechanic'] }])
    for (const id of IDS) game.makeMove({ playerId: id, type: 'player-ready', data: {}, timestamp: new Date() })
    game.makeMove({ playerId: 'host', type: 'start-voting', data: {}, timestamp: new Date() })
    const state = JSON.parse(JSON.stringify(game.getState()))
    state.data.spyPlayerId = 'spy'
    state.data.votes = { host: 'spy', third: 'spy', spy: 'host' }
    if (round) state.data.currentRound = round
    clock = state.data.phaseStartTime + state.data.votingTimeLimit * 1000 + 1_000
    const clockFirst = new SpyGame('game-1')
    clockFirst.loadState(JSON.parse(JSON.stringify(state)))
    expect(clockFirst.applyVotingTimeout(clock)).toBe(true)
    return { state, expected: clockFirst.getState() }
  }

  it('keeps the vote result the clock gave, the leaver\'s vote included', async () => {
    const { state, expected } = lapsedVote()

    await performPlayerLeave(lobbyWith('guess_the_spy', IDS, state) as any, 'ABCD12', 'third', mockLog)

    const written = writtenData().state
    expect(written.data.phase).toBe(SpyGamePhase.RESULTS)
    expect(written.data.votes).toEqual({ host: 'spy', third: 'spy', spy: 'host' })
    expect(written.data.scores).toEqual(expected.data.scores)
    expect(written.players.find((p) => p.id === 'third').isActive).toBe(false)
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'game-1',
      playerId: null,
      actionType: 'spy:vote-timeout',
      actionPayload: expect.objectContaining({ source: 'lobby-leave' }),
    }))
  })

  it('finishes the game row when the lapsed vote was the last round\'s', async () => {
    const { state, expected } = lapsedVote(3)
    expect(expected.status).toBe('finished')

    await performPlayerLeave(lobbyWith('guess_the_spy', IDS, state) as any, 'ABCD12', 'third', mockLog)

    const data = writtenData()
    expect(data.status).toBe('finished')
    expect(data.state.data.scores).toEqual(expected.data.scores)
    expect(data.endedAt).toBeInstanceOf(Date)
  })
})

describe('an Alias describer who leaves after the turn timer ran out', () => {
  const IDS = ['p1', 'p2', 'p3', 'p4']

  it('ends the turn as the clock would have, the unread words skipped', async () => {
    const game = new AliasGame('game-1')
    for (const id of IDS) game.addPlayer({ id, name: id, score: 0, isActive: true })
    game.startGame()
    game.makeMove({ playerId: 'p1', type: 'start_round', data: {}, timestamp: new Date() })
    const data = game.getState().data
    const describer = data.teams[0].playerIds[data.teams[0].describerIndex]
    for (let i = 0; i < 2; i += 1) {
      expect(game.makeMove({ playerId: describer, type: 'word_action', data: { action: 'guess' }, timestamp: new Date() })).toBe(true)
    }
    const state = JSON.parse(JSON.stringify(game.getState()))
    clock = state.data.turnStartedAt + 61_000
    const clockFirst = new AliasGame('game-1')
    clockFirst.restoreState(JSON.parse(JSON.stringify(state)))
    expect(clockFirst.applyTimeoutFallback(60, clock).changed).toBe(true)
    const expected = clockFirst.getState()

    await performPlayerLeave(lobbyWith('alias', IDS, state) as any, 'ABCD12', describer, mockLog)

    const written = writtenData().state
    expect(written.data.phase).toBe('turn_results')
    expect(written.data.lastTurnResult).toEqual(expected.data.lastTurnResult)
    expect(written.data.teams[0].score).toBe(expected.data.teams[0].score)
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'alias:timeout-fallback',
      actionPayload: expect.objectContaining({ source: 'lobby-leave' }),
    }))
  })
})
