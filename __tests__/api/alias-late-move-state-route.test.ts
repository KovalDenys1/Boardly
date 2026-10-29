/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as postGameState } from '@/app/api/game/[gameId]/state/route'
import { AliasGame } from '@/lib/games/alias'
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
const IDS = ['p1', 'p2', 'p3', 'p4']
const TURN_TIMER_SECONDS = 60
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

/** The first team's describer has guessed two words of the card. Returns the state, the describer and the turn's deadline. */
function seedActiveTurn() {
  const game = new AliasGame('game-123')
  for (const id of IDS) game.addPlayer({ id, name: id, score: 0, isActive: true })
  game.startGame()
  expect(game.makeMove({ playerId: 'p1', type: 'start_round', data: {}, timestamp: new Date() })).toBe(true)
  const data = game.getState().data
  const describer = data.teams[0].playerIds[data.teams[0].describerIndex]
  for (let i = 0; i < 2; i += 1) {
    expect(game.makeMove({ playerId: describer, type: 'word_action', data: { action: 'guess' }, timestamp: new Date() })).toBe(true)
  }
  const state = game.getState()
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(state),
    status: 'playing',
    gameType: 'alias',
    currentTurn: 0,
    updatedAt: new Date('2026-10-29T10:00:00.000Z'),
    lastMoveAt: new Date(state.lastMoveAt),
    startedAt: new Date('2026-10-29T09:55:00.000Z'),
    players: IDS.map(dbPlayer),
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'alias', turnTimer: TURN_TIMER_SECONDS, creatorId: 'p1' },
  })
  mockGetRequestAuthUser.mockResolvedValue({ id: describer, username: describer, suspended: false, isGuest: true })
  return { state: JSON.parse(JSON.stringify(state)), deadline: state.data.turnStartedAt + TURN_TIMER_SECONDS * 1000 }
}

function clockFirst(state: unknown, nowMs: number) {
  const game = new AliasGame('game-123')
  game.restoreState(JSON.parse(JSON.stringify(state)))
  expect(game.applyTimeoutFallback(TURN_TIMER_SECONDS, nowMs).changed).toBe(true)
  return game.getState()
}

beforeEach(() => {
  jest.clearAllMocks()
  clock = 1_000_000
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock)
  ;(broadcastToLobby as jest.Mock).mockResolvedValue(true)
  ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  ;(prisma.games.update as jest.Mock).mockResolvedValue({})
  ;(prisma.players.update as jest.Mock).mockResolvedValue({})
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (work: (tx: typeof prisma) => unknown) => work(prisma))
  ;(requiresTermsAcceptance as jest.Mock).mockResolvedValue(false)
})

afterEach(() => nowSpy.mockRestore())

describe('an Alias move that arrives after the turn timer ran out', () => {
  it.each([
    ['a guess', 'word_action', { action: 'guess' }],
    ['a skip', 'word_action', { action: 'skip' }],
    ['ending the turn', 'end_turn', {}],
  ])('ends the turn as the clock would have and refuses %s', async (_label, type, data) => {
    const { state, deadline } = seedActiveTurn()
    clock = deadline + 1_000

    const response = await postMove(type, data)

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Turn already ended', code: 'TURN_ALREADY_ENDED', skipped: true })
    const expected = clockFirst(state, clock)
    const writes = (prisma.games.updateMany as jest.Mock).mock.calls
    expect(writes).toHaveLength(1)
    const written = JSON.parse(JSON.stringify(writes[0][0].data.state))
    expect(written.data.phase).toBe('turn_results')
    expect(written.data.lastTurnResult).toEqual(expected.data.lastTurnResult)
    expect(written.data.lastTurnResult.wordResults.filter((r) => r.result === 'guessed')).toHaveLength(2)
    expect(written.data.teams.map((t) => t.score)).toEqual(expected.data.teams.map((t) => t.score))
    expect(appendGameReplaySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      playerId: null,
      actionType: 'alias:timeout-fallback',
      actionPayload: expect.objectContaining({ source: 'move' }),
    }))
  })

  it('scores a guess that arrives before the deadline', async () => {
    const { deadline } = seedActiveTurn()
    clock = deadline - 1_000

    const response = await postMove('word_action', { action: 'guess' })

    expect(response.status).toBe(200)
    expect(appendGameReplaySnapshot).not.toHaveBeenCalledWith(expect.objectContaining({ actionType: 'alias:timeout-fallback' }))
  })
})
