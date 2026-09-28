/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are loose here

/**
 * #1263: Guess the Spy's 60-second vote countdown was display-only, so one
 * player who never voted held the round open for good. The lobby GET now closes
 * the vote once its clock has run out, the way it applies the other party
 * games' timeouts, and a missing vote counts as no vote.
 */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/lobby/[code]/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { SpyGame, SpyGamePhase } from '@/lib/games/spy-game'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    games: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    players: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const IDS = ['user-1', 'user-2', 'user-3']

function votingState(openedAgoMs: number) {
  const game = new SpyGame('game-1')
  for (const id of IDS) game.addPlayer({ id, name: id })
  game.startGame()
  game.initializeRound([{ name: 'Airport', category: 'Travel', roles: ['Pilot', 'Passenger', 'Guard'] }])
  for (const id of IDS) game.makeMove({ playerId: id, type: 'player-ready', data: {}, timestamp: new Date() })
  game.makeMove({ playerId: 'user-1', type: 'start-voting', data: {}, timestamp: new Date() })
  const data = game.getState().data as any
  // One vote in, two never cast.
  game.makeMove({ playerId: 'user-1', type: 'vote', data: { targetId: 'user-2' }, timestamp: new Date() })
  data.phaseStartTime = Date.now() - openedAgoMs
  return game.getState()
}

function seed(state: unknown) {
  mockPrisma.lobbies.findUnique.mockResolvedValue({
    id: 'lobby-1',
    code: 'ABCD',
    name: 'L',
    password: null,
    maxPlayers: 10,
    isActive: true,
    gameType: 'guess_the_spy',
    // No lobby turn timer: Spy runs its own clocks, so the vote's must not depend on one.
    turnTimer: null,
    creatorId: 'user-1',
    createdAt: new Date(),
    creator: { id: 'user-1', username: 'user-1' },
    games: [
      {
        id: 'game-1',
        status: 'playing',
        gameType: 'guess_the_spy',
        state: JSON.stringify(state),
        updatedAt: new Date('2026-09-28T10:00:00.000Z'),
        startedAt: new Date(),
        lastMoveAt: new Date(),
        players: IDS.map((id, i) => ({ id: `p${i}`, userId: id, score: 0, user: { id, username: id } })),
      },
    ],
  } as any)
}

async function read() {
  const response = await GET(new NextRequest('http://localhost:3000/api/lobby/ABCD'), {
    params: Promise.resolve({ code: 'ABCD' }),
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return typeof body.activeGame.state === 'string' ? JSON.parse(body.activeGame.state) : body.activeGame.state
}

function writtenStates() {
  return mockPrisma.games.updateMany.mock.calls.map((call) => {
    const state = call[0].data.state
    return typeof state === 'string' ? JSON.parse(state) : state
  })
}

describe('GET /api/lobby/[code] closes an expired Guess the Spy vote (#1263)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'user-2', username: 'user-2', isGuest: true })
    mockPrisma.games.updateMany.mockResolvedValue({ count: 1 } as any)
    mockPrisma.players.update.mockResolvedValue({} as any)
  })

  it('leaves a vote that is still within its 60 seconds alone', async () => {
    seed(votingState(30_000))
    const state = await read()
    expect(state.data.phase).toBe(SpyGamePhase.VOTING)
    expect(writtenStates().filter((s) => s?.data?.phase === SpyGamePhase.RESULTS)).toHaveLength(0)
  })

  it('scores the votes that came in once the clock has run out, and broadcasts the result', async () => {
    seed(votingState(61_000))
    const state = await read()
    expect(state.data.phase).toBe(SpyGamePhase.RESULTS)

    const written = writtenStates().find((s) => s?.data?.phase === SpyGamePhase.RESULTS)
    expect(written).toBeDefined()
    // The single vote on user-2 is the only one counted.
    expect(written.data.votes).toEqual({ 'user-1': 'user-2' })

    const updates = (broadcastToLobby as jest.Mock).mock.calls.filter(([, event]) => event === 'game-update')
    expect(updates.length).toBeGreaterThan(0)
    expect(updates[0][2].payload.state.data.phase).toBe(SpyGamePhase.RESULTS)
  })
})
