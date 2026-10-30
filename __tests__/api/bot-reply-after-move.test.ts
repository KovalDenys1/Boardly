/**
 * @jest-environment node
 */

import { NextRequest } from 'next/server'
import { POST as postState } from '@/app/api/game/[gameId]/state/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { TicTacToeGame } from '@/lib/games/tic-tac-toe-game'
import { botUxDelayUpperBoundMs, resolveBotUxDelayMs } from '@/lib/bots/core/bot-ux-timing'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    games: { findUnique: jest.fn(), updateMany: jest.fn() },
    players: { update: jest.fn() },
    operationalEvents: { create: jest.fn() },
  },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn().mockResolvedValue(true) }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn() }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { game: {} },
}))
jest.mock('@/lib/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})

const HUMAN = 'human-1'
const BOT = 'bot-1'
const GAME_ID = 'game-ttt'
const BOT_PAUSE_BASE_MS = 120

let row: { id: string; state: unknown; status: string; currentTurn: number; updatedAt: Date; lastMoveAt: Date | null; startedAt: Date }
const originalFetch = global.fetch
const originalEnv = { ...process.env }
const mockBroadcast = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>

function snapshot() {
  return {
    ...row,
    state: JSON.parse(JSON.stringify(row.state)),
    players: [
      { id: 'p-human', userId: HUMAN, score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, leftAt: null, user: { id: HUMAN, username: 'Human', bot: null } },
      { id: 'p-bot', userId: BOT, score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, leftAt: null, user: { id: BOT, username: 'Grid Tactician', bot: { id: 'b1', difficulty: 'easy' } } },
    ],
    lobby: { id: 'lobby-1', code: '4821', gameType: 'tic_tac_toe', turnTimer: 60, creatorId: HUMAN },
  }
}

function startedState() {
  const engine = new TicTacToeGame(GAME_ID)
  engine.addPlayer({ id: HUMAN, name: 'Human' })
  engine.addPlayer({ id: BOT, name: 'Grid Tactician' })
  engine.startGame()
  return JSON.parse(JSON.stringify(engine.getState()))
}

function botRepliesBroadcast() {
  return mockBroadcast.mock.calls.filter(([, event, payload]) => {
    const state = (payload as { payload?: { currentPlayerIndex?: number; data?: { board?: (string | null)[][] } } }).payload
    const marks = state?.data?.board?.flat().filter(Boolean).length ?? 0
    return event === 'game-update' && marks === 2 && state?.currentPlayerIndex === 0
  })
}

async function placeFirstMark() {
  const response = await postState(
    new NextRequest(`http://localhost:3000/api/game/${GAME_ID}/state`, {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: GAME_ID, move: { type: 'place', playerId: HUMAN, data: { row: 1, col: 1 } }, userId: HUMAN }),
    }),
    { params: Promise.resolve({ gameId: GAME_ID }) },
  )
  expect(response.status).toBe(200)
}

describe("the bot's reply to a move in Tic-Tac-Toe", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers({ now: new Date('2026-10-30T09:00:00.000Z') })
    process.env = { ...originalEnv, BOARDLY_INTERNAL_SECRET: 'internal-secret', NEXTAUTH_URL: 'https://www.boardly.online' }
    delete process.env.BOT_UX_DELAY_MS
    ;(getRequestAuthUser as jest.Mock).mockResolvedValue({ id: HUMAN, username: 'Human', isGuest: true })

    const created = new Date('2026-10-30T08:59:00.000Z')
    row = { id: GAME_ID, state: startedState(), status: 'playing', currentTurn: 0, updatedAt: created, lastMoveAt: null, startedAt: created }
    ;(prisma.games.findUnique as jest.Mock).mockImplementation(async () => snapshot())
    ;(prisma.games.updateMany as jest.Mock).mockImplementation(async ({ where, data }) => {
      if (where.currentTurn !== row.currentTurn || where.updatedAt.getTime() !== row.updatedAt.getTime()) return { count: 0 }
      row = { ...row, ...data, state: JSON.parse(JSON.stringify(data.state)) }
      return { count: 1 }
    })
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (work) => work(prisma))
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.operationalEvents.create as jest.Mock).mockResolvedValue({})
    // Nothing answers a request this app makes to itself, as on production where the proxy refuses it.
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
  })

  afterEach(() => {
    jest.useRealTimers()
    global.fetch = originalFetch
    process.env = { ...originalEnv }
  })

  it.each([
    ['at the default pace', undefined],
    ['with the pace variable set far above the cap', '60000'],
  ])('is broadcast when the capped pause ends and not before, %s', async (_label, override) => {
    if (override) process.env.BOT_UX_DELAY_MS = override
    const pauseMs = resolveBotUxDelayMs('easy', BOT_PAUSE_BASE_MS)
    expect(pauseMs).toBeLessThanOrEqual(botUxDelayUpperBoundMs(BOT_PAUSE_BASE_MS))
    expect(botUxDelayUpperBoundMs(BOT_PAUSE_BASE_MS)).toBeLessThanOrEqual(2000)

    await placeFirstMark()
    await jest.advanceTimersByTimeAsync(pauseMs - 1)
    expect(botRepliesBroadcast()).toHaveLength(0)

    await jest.advanceTimersByTimeAsync(1)
    expect(botRepliesBroadcast()).toHaveLength(1)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
