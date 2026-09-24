/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma methods are intentionally loose here

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/game/[gameId]/results/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

describe('GET /api/game/[gameId]/results', () => {
  const mockGame = {
    id: 'game-1',
    state: { status: 'finished' },
    gameType: 'yahtzee',
    status: 'finished',
    createdAt: new Date('2026-02-27T18:00:00.000Z'),
    updatedAt: new Date('2026-02-27T18:10:00.000Z'),
    abandonedAt: null,
    _count: {
      snapshots: 12,
    },
    lobby: {
      code: 'ABCD12',
      name: 'Test Lobby',
      gameType: 'yahtzee',
    },
    players: [
      {
        userId: 'user-1',
        score: 200,
        finalScore: 220,
        placement: 1,
        isWinner: true,
        user: {
          id: 'user-1',
          username: 'User 1',
          image: 'https://example.com/u1.png',
          bot: null,
        },
      },
      {
        userId: 'user-2',
        score: 180,
        finalScore: 180,
        placement: 2,
        isWinner: false,
        user: {
          id: 'user-2',
          username: 'User 2',
          image: null,
          bot: null,
        },
      },
    ],
  }

  const buildRequest = (url = 'http://localhost:3000/api/game/game-1/results') =>
    new NextRequest(url, { method: 'GET' })

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.games.findUnique.mockResolvedValue(mockGame as any)
  })

  it('returns 401 when request is unauthorized', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns replay metadata together with match details for players', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.id).toBe('game-1')
    expect(payload.hasReplay).toBe(true)
    expect(payload.replayStepCount).toBe(12)
    expect(payload.endedAt).toBe('2026-02-27T18:10:00.000Z')
    expect(payload.durationMs).toBe(10 * 60 * 1000)
    expect(payload.players[0]).toEqual(
      expect.objectContaining({
        id: 'user-1',
        username: 'User 1',
        avatar: 'https://example.com/u1.png',
        isWinner: true,
      })
    )
  })

  it('hides replay in match details when the game is not finished even if snapshots exist', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1' } as any)
    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      status: 'abandoned',
      abandonedAt: new Date('2026-02-27T18:06:00.000Z'),
      _count: {
        snapshots: 12,
      },
    } as any)

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ gameId: 'game-1' }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.hasReplay).toBe(false)
    expect(payload.replayStepCount).toBe(12)
    expect(payload.endedAt).toBe('2026-02-27T18:06:00.000Z')
    expect(payload.durationMs).toBe(6 * 60 * 1000)
  })

  // #1103: this route returned `game.state` raw to any player while the game was
  // still running – the Sketch & Guess word in every language, the drawer's three
  // choices and every guess, before a single stroke; the same for Memory's card
  // values and Alias's words. It now goes through the broadcast sanitizer.
  it('never hands a player the secrets of a game that is still running', async () => {
    const { SketchAndGuessGame } = require('@/lib/games/sketch-and-guess-game')
    const engine = new SketchAndGuessGame('game-live', { maxPlayers: 10, minPlayers: 3 })
    engine.addPlayer({ id: 'user-1', name: 'Drawer', score: 0 })
    engine.addPlayer({ id: 'user-2', name: 'Guesser', score: 0 })
    engine.addPlayer({ id: 'user-3', name: 'Other', score: 0 })
    engine.startGame()
    const state = engine.getState()
    const drawerId = state.data.currentDrawerId
    const guesserId = ['user-1', 'user-2', 'user-3'].find((id) => id !== drawerId)
    const secrets = JSON.stringify(state.data.rounds[0]?.wordChoices ?? [])
    expect(secrets.length).toBeGreaterThan(2)

    mockPrisma.games.findUnique.mockResolvedValue({
      ...mockGame,
      id: 'game-live',
      gameType: 'sketch_and_guess',
      status: 'playing',
      state: JSON.stringify(state),
      lobby: { ...mockGame.lobby, gameType: 'sketch_and_guess' },
      players: ['user-1', 'user-2', 'user-3'].map((id) => ({ ...mockGame.players[0], userId: id, user: { ...mockGame.players[0].user, id } })),
    } as any)
    mockGetRequestAuthUser.mockResolvedValue({ id: guesserId } as any)

    const response = await GET(buildRequest('http://localhost:3000/api/game/game-live/results'), {
      params: Promise.resolve({ gameId: 'game-live' }),
    })
    expect(response.status).toBe(200)
    const body = JSON.stringify(await response.json())
    // The Russian forms are Cyrillic, so they can only be in the body as the secret.
    for (const choice of state.data.rounds[0].wordChoices) {
      expect(body).not.toContain(choice.ru[0])
    }
  })
})
