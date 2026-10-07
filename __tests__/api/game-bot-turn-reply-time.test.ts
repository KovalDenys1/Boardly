/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/bot-turn/route'
import { prisma } from '@/lib/db'
import { restoreGameEngine } from '@/lib/game-registry'
import { executeBotTurn } from '@/lib/bots'
import { broadcastToLobby } from '@/lib/supabase-server'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: { findUnique: jest.fn(), updateMany: jest.fn() },
    players: { update: jest.fn() },
    operationalEvents: { create: jest.fn() },
  },
}))

jest.mock('@/lib/game-registry', () => ({
  restoreGameEngine: jest.fn(),
  hasBotSupport: jest.fn(() => true),
}))

jest.mock('@/lib/bots', () => ({
  executeBotTurn: jest.fn(),
  getBotDifficulty: jest.fn(() => 'hard'),
}))

jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('@/lib/game-replay', () => ({ appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/achievement-engine', () => ({ checkAchievementsOnStatusChange: jest.fn() }))
jest.mock('@/lib/logger', () => {
  const log = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})

const mockRestoreGameEngine = restoreGameEngine as jest.MockedFunction<typeof restoreGameEngine>
const mockExecuteBotTurn = executeBotTurn as jest.MockedFunction<typeof executeBotTurn>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
const originalSecret = process.env.BOARDLY_INTERNAL_SECRET

const initialState = {
  players: [{ id: 'player-1', score: 0 }, { id: 'bot-1', score: 0 }],
  status: 'playing',
  currentPlayerIndex: 1,
  data: {},
}

function setUp(afterMove: Record<string, unknown>) {
  ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
    id: 'game-123',
    state: JSON.stringify(initialState),
    status: 'playing',
    currentTurn: 4,
    startedAt: new Date('2026-10-07T10:00:00.000Z'),
    updatedAt: new Date('2026-10-07T10:00:05.000Z'),
    players: [
      { id: 'db-player-1', userId: 'player-1', score: 0, scorecard: '{}', user: { id: 'player-1', bot: null } },
      { id: 'db-bot', userId: 'bot-1', score: 0, scorecard: '{}', user: { id: 'bot-1', bot: { id: 'b' } } },
    ],
    lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'yahtzee' },
  })
  const state = { ...initialState, ...afterMove }
  mockRestoreGameEngine.mockReturnValue({
    getState: jest.fn().mockReturnValueOnce(initialState).mockReturnValue(state),
    // The bot scored, so its Players row has something to write.
    getPlayers: jest.fn(() => [{ id: 'player-1', score: 0 }, { id: 'bot-1', score: 12 }]),
    makeMove: jest.fn().mockReturnValue(true),
  } as never)
  mockExecuteBotTurn.mockImplementation(async (_type, _engine, _bot, _difficulty, onMove) => {
    await onMove({ playerId: 'bot-1', type: 'score', data: {}, timestamp: new Date() } as never)
  })
}

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:3000/api/game/game-123/bot-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': 'secret' },
    body: JSON.stringify({ botUserId: 'bot-1', lobbyCode: 'ABCD12', ...body }),
  })
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('POST /api/game/[gameId]/bot-turn reply time', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.BOARDLY_INTERNAL_SECRET = 'secret'
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    ;(prisma.players.update as jest.Mock).mockResolvedValue({})
    ;(prisma.operationalEvents.create as jest.Mock).mockResolvedValue({})
    mockBroadcastToLobby.mockResolvedValue(true)
  })

  afterAll(() => {
    process.env.BOARDLY_INTERNAL_SECRET = originalSecret
  })

  it('sends a mid-game move to the table before writing the Players rows', async () => {
    setUp({ currentPlayerIndex: 0, lastMoveAt: Date.now() })

    const response = await POST(request({}), { params: Promise.resolve({ gameId: 'game-123' }) })
    expect(response.status).toBe(200)

    const gameUpdate = mockBroadcastToLobby.mock.calls.find(([, event]) => event === 'game-update')
    expect(gameUpdate?.[2]).toMatchObject({ action: 'state-change', gameId: 'game-123' })
    const broadcastOrder = mockBroadcastToLobby.mock.invocationCallOrder[
      mockBroadcastToLobby.mock.calls.indexOf(gameUpdate!)
    ]
    const playersOrder = (prisma.players.update as jest.Mock).mock.invocationCallOrder[0]
    expect(broadcastOrder).toBeLessThan(playersOrder)
  })

  it('holds a game-ending move until the Players rows the results screen reads are written', async () => {
    setUp({ status: 'finished', winner: 'bot-1', lastMoveAt: Date.now() })

    await POST(request({}), { params: Promise.resolve({ gameId: 'game-123' }) })

    const gameUpdateIndex = mockBroadcastToLobby.mock.calls.findIndex(([, event]) => event === 'game-update')
    const broadcastOrder = mockBroadcastToLobby.mock.invocationCallOrder[gameUpdateIndex]
    const playersOrder = (prisma.players.update as jest.Mock).mock.invocationCallOrder[0]
    expect(playersOrder).toBeLessThan(broadcastOrder)
  })

  it('records one bot_turn_applied row timed from the upstream trigger', async () => {
    setUp({ currentPlayerIndex: 0, lastMoveAt: Date.now() })
    const triggeredAt = Date.now() - 400

    await POST(request({ triggerSource: 'state-route-auto', triggeredAt }), {
      params: Promise.resolve({ gameId: 'game-123' }),
    })
    await flush()

    expect(prisma.operationalEvents.create).toHaveBeenCalledTimes(1)
    const { data } = (prisma.operationalEvents.create as jest.Mock).mock.calls[0][0]
    expect(data).toMatchObject({
      eventName: 'bot_turn_applied',
      metricType: 'latency',
      gameType: 'yahtzee',
      success: true,
      source: 'state-route-auto',
      payload: { difficulty: 'hard', commits: 1 },
    })
    expect(data.latencyMs).toBeGreaterThanOrEqual(400)
    expect(data.latencyMs).toBeLessThan(5_000)
    expect(data.payload.turn_ms).toBe(data.latencyMs)
  })

  it('ignores a trigger time from the future and measures from the request instead', async () => {
    setUp({ currentPlayerIndex: 0, lastMoveAt: Date.now() })

    await POST(request({ triggeredAt: Date.now() + 60_000 }), { params: Promise.resolve({ gameId: 'game-123' }) })
    await flush()

    const { data } = (prisma.operationalEvents.create as jest.Mock).mock.calls[0][0]
    expect(data.latencyMs).toBeGreaterThanOrEqual(0)
    expect(data.latencyMs).toBeLessThan(5_000)
  })

  it('records a turn that failed before any commit, so a stalled bot shows up', async () => {
    setUp({ currentPlayerIndex: 0 })
    mockExecuteBotTurn.mockRejectedValue(new Error('No legal moves'))

    const response = await POST(request({}), { params: Promise.resolve({ gameId: 'game-123' }) })
    await flush()

    expect(response.status).toBe(500)
    const { data } = (prisma.operationalEvents.create as jest.Mock).mock.calls[0][0]
    expect(data).toMatchObject({ success: false, latencyMs: null, reason: 'No legal moves' })
  })

  it('writes nothing when another instance won the turn', async () => {
    setUp({ currentPlayerIndex: 0 })
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 0 })

    const response = await POST(request({}), { params: Promise.resolve({ gameId: 'game-123' }) })
    await flush()

    expect(response.status).toBe(409)
    expect(prisma.operationalEvents.create).not.toHaveBeenCalled()
  })

  it('never fails the turn when the metric write does', async () => {
    setUp({ currentPlayerIndex: 0, lastMoveAt: Date.now() })
    ;(prisma.operationalEvents.create as jest.Mock).mockRejectedValue(new Error('db down'))

    const response = await POST(request({}), { params: Promise.resolve({ gameId: 'game-123' }) })
    await flush()

    expect(response.status).toBe(200)
  })
})
