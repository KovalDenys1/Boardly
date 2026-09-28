/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are loose here

/**
 * #1260: "Back to lobby" rebuilt the waiting game with no rules at all, so
 * normalizeLudoMode(undefined) turned a classic Ludo room into a quick one (and
 * Yahtzee's mode, Memory's difficulty and Tic-Tac-Toe's series length went the
 * same way). Only "Play again" kept them. Driven through the real route and the
 * real engines, so the mode is read from where the game actually keeps it.
 */
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/[code]/return-to-waiting/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { createGameEngine } from '@/lib/game-registry'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: { findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn().mockResolvedValue(true) }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => async () => null,
  rateLimitPresets: { api: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const tx = {
  games: { create: jest.fn() },
  players: { createMany: jest.fn() },
}

function finishedGameState(gameType: string, rules: Record<string, unknown>) {
  const engine = createGameEngine(gameType, 'finished-1', { rules })
  const state = engine.getState()
  return JSON.stringify({ ...state, status: 'finished' })
}

function seed(gameType: string, state: string) {
  mockPrisma.lobbies.findUnique.mockResolvedValue({
    id: 'lobby-1',
    code: 'ABCD',
    gameType,
    creatorId: 'host',
    games: [
      {
        id: 'finished-1',
        status: 'finished',
        gameType,
        state,
        updatedAt: new Date(),
        players: [
          { userId: 'host', leftAt: null, user: { bot: null } },
          { userId: 'guest', leftAt: null, user: { bot: null } },
        ],
      },
    ],
  } as any)
}

async function backToLobby() {
  const response = await POST(new NextRequest('http://localhost:3000/api/lobby/ABCD/return-to-waiting', { method: 'POST' }), {
    params: Promise.resolve({ code: 'ABCD' }),
  })
  expect(response.status).toBe(200)
  const written = tx.games.create.mock.calls[0][0].data.state
  return typeof written === 'string' ? JSON.parse(written) : written
}

describe('POST /api/lobby/[code]/return-to-waiting keeps the room\'s rules (#1260)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: 'host', username: 'Host' })
    mockPrisma.$transaction.mockImplementation(async (cb) => cb(tx))
    tx.games.create.mockResolvedValue({ id: 'waiting-1' })
    tx.players.createMany.mockResolvedValue({ count: 2 })
    mockPrisma.lobbies.update.mockResolvedValue({} as any)
  })

  it('keeps a classic Ludo lobby classic', async () => {
    seed('ludo', finishedGameState('ludo', { mode: 'classic' }))
    const state = await backToLobby()
    expect(state.status).toBe('waiting')
    expect(state.data.mode).toBe('classic')
  })

  it('keeps a quick Ludo lobby quick', async () => {
    seed('ludo', finishedGameState('ludo', { mode: 'quick' }))
    expect((await backToLobby()).data.mode).toBe('quick')
  })

  it('keeps Yahtzee\'s short mode', async () => {
    seed('yahtzee', finishedGameState('yahtzee', { mode: 'short' }))
    expect((await backToLobby()).data.mode).toBe('short')
  })

  it('keeps Memory\'s difficulty', async () => {
    seed('memory', finishedGameState('memory', { difficulty: 'hard' }))
    expect((await backToLobby()).data.difficulty).toBe('hard')
  })

  it('falls back to the defaults when the finished state carries no rules', async () => {
    seed('ludo', JSON.stringify({ status: 'finished', data: {} }))
    expect((await backToLobby()).data.mode).toBe('quick')
  })
})
