/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are loose here

/**
 * PR #1100 review: the word hint was built in whatever language a request
 * named, so one guesser could fetch the pattern in all four. The lobby GET now
 * fixes the language the first time a guesser asks in a round and serves only
 * that one afterwards.
 */
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/lobby/[code]/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { SketchAndGuessGame } from '@/lib/games/sketch-and-guess-game'

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

function drawingState() {
  const game = new SketchAndGuessGame('game-1', { maxPlayers: 10, minPlayers: 3, rules: { rounds: 2 } })
  game.addPlayer({ id: 'user-1', name: 'A' })
  game.addPlayer({ id: 'user-2', name: 'B' })
  game.addPlayer({ id: 'user-3', name: 'C' })
  game.startGame()
  const choices = (game.getState().data as any).rounds[0].wordChoices
  game.makeMove({ playerId: 'user-1', type: 'choose-word', data: { wordId: choices[0].id }, timestamp: new Date() })
  return game.getState()
}

function seed(state: unknown) {
  const updatedAt = new Date('2026-09-24T10:00:00.000Z')
  mockPrisma.lobbies.findUnique.mockResolvedValue({
    id: 'lobby-1',
    code: 'ABCD',
    name: 'L',
    password: null,
    maxPlayers: 10,
    isActive: true,
    gameType: 'sketch_and_guess',
    creatorId: 'user-1',
    createdAt: new Date(),
    creator: { id: 'user-1', username: 'A' },
    games: [
      {
        id: 'game-1',
        status: 'playing',
        gameType: 'sketch_and_guess',
        state: JSON.stringify(state),
        updatedAt,
        startedAt: new Date(),
        lastMoveAt: new Date(),
        players: [
          { id: 'p1', userId: 'user-1', score: 0, user: { id: 'user-1', username: 'A' } },
          { id: 'p2', userId: 'user-2', score: 0, user: { id: 'user-2', username: 'B' } },
          { id: 'p3', userId: 'user-3', score: 0, user: { id: 'user-3', username: 'C' } },
        ],
      },
    ],
  } as any)
}

async function hintFor(locale: string) {
  const response = await GET(new NextRequest(`http://localhost:3000/api/lobby/ABCD?includeFinished=true&locale=${locale}`), {
    params: Promise.resolve({ code: 'ABCD' }),
  })
  const body = await response.json()
  const state = typeof body.activeGame.state === 'string' ? JSON.parse(body.activeGame.state) : body.activeGame.state
  return state.data.rounds[0].wordHint
}

describe('GET /api/lobby/[code] Sketch & Guess hint language lock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'user-2', username: 'B', isGuest: true })
    mockPrisma.games.updateMany.mockResolvedValue({ count: 1 } as any)
  })

  it('fixes the first language asked in, writes it once, and serves it to a later request in another', async () => {
    seed(drawingState())
    expect((await hintFor('ru'))?.lang).toBe('ru')
    const writes = mockPrisma.games.updateMany.mock.calls.filter((call) => JSON.stringify(call[0].data.state ?? '').includes('hintLocales'))
    expect(writes).toHaveLength(1)

    const written = writes[0][0].data.state
    seed(typeof written === 'string' ? JSON.parse(written) : written)
    mockPrisma.games.updateMany.mockClear()
    const later = await hintFor('en')
    expect(later?.lang).toBe('ru')
    expect(mockPrisma.games.updateMany).not.toHaveBeenCalled()
  })

  it('serves no hint at all when the lock could not be written', async () => {
    mockPrisma.games.updateMany.mockResolvedValue({ count: 0 } as any)
    seed(drawingState())
    expect(await hintFor('uk')).toBeUndefined()
  })
})
