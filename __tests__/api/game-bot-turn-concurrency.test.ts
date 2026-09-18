/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/bot-turn/route'
import { prisma } from '@/lib/db'
import { restoreGameEngine } from '@/lib/game-registry'
import { getRequestAuthUser } from '@/lib/request-auth'
import { executeBotTurn } from '@/lib/bots'
import { broadcastToLobby } from '@/lib/supabase-server'
import { appendGameReplaySnapshot } from '@/lib/game-replay'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    players: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/game-registry', () => ({
  restoreGameEngine: jest.fn(),
  hasBotSupport: jest.fn(() => true),
}))

jest.mock('@/lib/bots', () => ({
  executeBotTurn: jest.fn(),
  getBotDifficulty: jest.fn(() => 'medium'),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
}))

jest.mock('@/lib/disconnected-turn', () => ({
  advanceTurnPastDisconnectedPlayers: jest.fn((state: unknown) => ({
    changed: false,
    skippedPlayerIds: [],
    currentPlayerId: (state as { currentPlayerId?: string })?.currentPlayerId ?? null,
  })),
}))

jest.mock('@/lib/game-replay', () => ({
  appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockRestoreGameEngine = restoreGameEngine as jest.MockedFunction<typeof restoreGameEngine>
const mockExecuteBotTurn = executeBotTurn as jest.MockedFunction<typeof executeBotTurn>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
const mockAppendGameReplaySnapshot = appendGameReplaySnapshot as jest.MockedFunction<
  typeof appendGameReplaySnapshot
>
const originalSocketSecret = process.env.BOARDLY_INTERNAL_SECRET

function buildRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost:3000/api/game/game-123/bot-turn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

const initialState = {
  players: [
    { id: 'player-1', score: 0 },
    { id: 'bot-1', score: 0 },
  ],
  status: 'playing',
  currentPlayerIndex: 1,
  data: {
    board: [
      ['X', null, null],
      [null, null, null],
      [null, null, null],
    ],
    currentSymbol: 'O',
  },
}

const updatedState = {
  ...initialState,
  currentPlayerIndex: 0,
  lastMoveAt: Date.now(),
  data: {
    ...initialState.data,
    board: [
      ['X', 'O', null],
      [null, null, null],
      [null, null, null],
    ],
    currentSymbol: 'X',
  },
}

/**
 * #1002: a bot turn that loses the optimistic-lock race to another serverless
 * instance used to be reported as a database failure, because the catch around
 * the persist block swallowed the typed error and rethrew a generic one — so the
 * 409 branch the client is written against was unreachable.
 */
describe('POST /api/game/[gameId]/bot-turn concurrent execution', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.BOARDLY_INTERNAL_SECRET = 'test-internal-secret'
    ;(prisma.games.update as jest.Mock).mockResolvedValue({} as any)
    mockBroadcastToLobby.mockResolvedValue(true as any)
    mockAppendGameReplaySnapshot.mockResolvedValue(undefined)

    mockGetRequestAuthUser.mockResolvedValue({
      id: 'player-1',
      username: 'Player 1',
      suspended: false,
      isGuest: false,
    } as any)

    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-123',
      state: JSON.stringify(initialState),
      status: 'playing',
      currentTurn: 1,
      updatedAt: new Date('2026-09-17T10:00:00.000Z'),
      players: [
        {
          id: 'db-player-1',
          userId: 'player-1',
          score: 0,
          scorecard: '{}',
          user: { id: 'player-1', bot: null },
        },
        {
          id: 'db-player-bot',
          userId: 'bot-1',
          score: 0,
          scorecard: '{}',
          user: { id: 'bot-1', bot: { id: 'bot-meta-1' } },
        },
      ],
      lobby: {
        id: 'lobby-123',
        code: 'ABCD12',
        gameType: 'tic_tac_toe',
      },
    } as any)

    mockRestoreGameEngine.mockReturnValue({
      getState: jest
        .fn()
        .mockReturnValueOnce(initialState)
        .mockReturnValue(updatedState),
      getPlayers: jest.fn(() => [
        { id: 'player-1', score: 0 },
        { id: 'bot-1', score: 0 },
      ]),
      makeMove: jest.fn().mockReturnValue(true),
    } as any)

    mockExecuteBotTurn.mockImplementation(async (_gameType, _engine, _botUserId, _difficulty, onMove) => {
      await onMove({
        playerId: 'bot-1',
        type: 'place',
        data: { row: 0, col: 1 },
        timestamp: new Date(),
      } as any)
    })
  })

  afterAll(() => {
    process.env.BOARDLY_INTERNAL_SECRET = originalSocketSecret
  })

  it('answers 409 when the optimistic lock matched no rows', async () => {
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 0 } as any)

    const response = await POST(
      buildRequest({ botUserId: 'bot-1', lobbyCode: 'ABCD12' }),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ message: 'Turn already processed by another instance' })
    // The other instance owns this turn, so nothing of ours may reach the table.
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
    expect(prisma.players.update).not.toHaveBeenCalled()
  })

  it('still answers 500 when the write itself fails', async () => {
    ;(prisma.games.updateMany as jest.Mock).mockRejectedValue(new Error('connection terminated'))

    const response = await POST(
      buildRequest({ botUserId: 'bot-1', lobbyCode: 'ABCD12' }),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.code).toBe('BOT_TURN_FAILED')
  })
})
