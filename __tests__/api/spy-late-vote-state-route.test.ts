/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as postGameState } from '@/app/api/game/[gameId]/state/route'
import { SpyGame, SpyGamePhase, SPY_ROLE_REVEAL_TIME_LIMIT_SECONDS } from '@/lib/games/spy-game'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { requiresTermsAcceptance } from '@/lib/terms-gate'
import { appendGameReplaySnapshot } from '@/lib/game-replay'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    games: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    players: { update: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/terms-gate', () => ({ requiresTermsAcceptance: jest.fn() }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {},
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const IDS = ['host', 'late', 'third', 'spy']
const params = { params: Promise.resolve({ gameId: 'game-123' }) }

let clock = 1_000_000
let nowSpy: jest.SpyInstance<number, []>

function postMove(type: string, data: Record<string, unknown> = {}) {
  return postGameState(
    new NextRequest('http://localhost:3000/api/game/game-123/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ move: { type, data } }),
    }),
    params
  )
}

function dbPlayer(userId: string) {
  return {
    id: `db-${userId}`,
    userId,
    score: 0,
    scorecard: null,
    finalScore: null,
    placement: null,
    isWinner: false,
    leftAt: null,
    user: { id: userId, username: userId, bot: null },
  }
}

function seed(state: unknown) {
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(state),
    status: 'playing',
    gameType: 'guess_the_spy',
    currentTurn: 3,
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
    lastMoveAt: null,
    startedAt: new Date('2026-10-29T09:55:00.000Z'),
    players: IDS.map(dbPlayer),
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'guess_the_spy', turnTimer: 60, creatorId: 'host' },
  })
}

function roleReveal() {
  const game = new SpyGame('game-123')
  for (const id of IDS) game.addPlayer({ id, name: id })
  game.startGame()
  game.initializeRound([{ name: 'Airport', category: 'Travel', roles: ['Pilot', 'Passenger', 'Guard', 'Mechanic'] }])
  return game
}

/** host and third vote for the spy, the spy for host; `late` has not voted. Returns the vote's deadline. */
function seedSplitVote(): { state: unknown; deadline: number } {
  const game = roleReveal()
  for (const id of IDS) game.makeMove({ playerId: id, type: 'player-ready', data: {}, timestamp: new Date() })
  game.makeMove({ playerId: 'host', type: 'start-voting', data: {}, timestamp: new Date() })
  const state = game.getState()
  state.data.spyPlayerId = 'spy'
  state.data.votes = { host: 'spy', third: 'spy', spy: 'host' }
  seed(state)
  return { state: JSON.parse(JSON.stringify(state)), deadline: state.data.phaseStartTime + state.data.votingTimeLimit * 1000 }
}

function clockFirst(state: unknown, nowMs: number) {
  const game = new SpyGame('game-123')
  game.loadState(JSON.parse(JSON.stringify(state)))
  expect(game.applyVotingTimeout(nowMs)).toBe(true)
  return game.getState()
}

function writtenState() {
  const writes = (prisma.games.updateMany as jest.Mock).mock.calls
  expect(writes).toHaveLength(1)
  return { state: JSON.parse(JSON.stringify(writes[0][0].data.state)), data: writes[0][0].data }
}

beforeEach(() => {
  jest.clearAllMocks()
  clock = 1_000_000
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
  ;(broadcastToLobby as jest.Mock).mockResolvedValue(true)
  ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.players.update as jest.Mock).mockResolvedValue({})
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma))
  mockGetRequestAuthUser.mockResolvedValue({ id: 'late', username: 'late', suspended: false, isGuest: true })
  ;(requiresTermsAcceptance as jest.Mock).mockResolvedValue(false)
})

afterEach(() => nowSpy.mockRestore())

describe('a Guess the Spy vote that arrives after the vote deadline', () => {
  it('closes the vote as the clock would have and refuses the late vote', async () => {
    const { state, deadline } = seedSplitVote()
    clock = deadline + 1_000

    const response = await postMove('vote', { targetId: 'host' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Turn already ended', code: 'TURN_ALREADY_ENDED', skipped: true })
    const expected = clockFirst(state, clock)
    const { state: written } = writtenState()
    expect(written.data.phase).toBe(SpyGamePhase.RESULTS)
    expect(written.data.votes).toEqual({ host: 'spy', third: 'spy', spy: 'host' })
    expect(written.data.scores).toEqual(expected.data.scores)
    expect(written.status).toBe(expected.status)
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      playerId: null,
      actionType: 'spy:vote-timeout',
      actionPayload: expect.objectContaining({ source: 'move' }),
    }))
  })

  it('takes a vote that arrives before the deadline', async () => {
    const { deadline } = seedSplitVote()
    clock = deadline - 1_000

    const response = await postMove('vote', { targetId: 'host' })

    expect(response.status).toBe(200)
    const { state: written } = writtenState()
    expect(written.data.votes.late).toBe('host')
  })
})

describe('a Guess the Spy ready-up that arrives after the role reveal deadline', () => {
  it('starts the questions as the clock would have and refuses the ready-up', async () => {
    const game = roleReveal()
    const state = game.getState()
    seed(state)
    clock = state.data.phaseStartTime + SPY_ROLE_REVEAL_TIME_LIMIT_SECONDS * 1000 + 1_000

    const response = await postMove('player-ready')

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual(expect.objectContaining({ code: 'TURN_ALREADY_ENDED' }))
    const { state: written } = writtenState()
    expect(written.data.phase).toBe(SpyGamePhase.QUESTIONING)
    expect(written.data.playersReady).toEqual([])
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'spy:reveal-timeout' }))
  })
})
