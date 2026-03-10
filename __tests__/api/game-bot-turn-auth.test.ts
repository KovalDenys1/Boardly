/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/bot-turn/route'
import { prisma } from '@/lib/db'
import { restoreGameEngine } from '@/lib/game-registry'
import { getRequestAuthUser } from '@/lib/request-auth'
import { executeBotTurn } from '@/lib/bots'
import { notifySocket } from '@/lib/socket-url'
import { appendGameReplaySnapshot } from '@/lib/game-replay'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
      update: jest.fn(),
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

jest.mock('@/lib/socket-url', () => ({
  notifySocket: jest.fn(),
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
const mockNotifySocket = notifySocket as jest.MockedFunction<typeof notifySocket>
const mockAppendGameReplaySnapshot = appendGameReplaySnapshot as jest.MockedFunction<
  typeof appendGameReplaySnapshot
>
const originalSocketSecret = process.env.SOCKET_SERVER_INTERNAL_SECRET

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

describe('POST /api/game/[gameId]/bot-turn auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.SOCKET_SERVER_INTERNAL_SECRET = 'test-internal-secret'
    ;(prisma.games.update as jest.Mock).mockResolvedValue({} as any)
    mockNotifySocket.mockResolvedValue(true as any)
    mockAppendGameReplaySnapshot.mockResolvedValue(undefined)
  })

  afterAll(() => {
    process.env.SOCKET_SERVER_INTERNAL_SECRET = originalSocketSecret
  })

  it('returns 401 when request has no internal secret and no authenticated user', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

    const response = await POST(
      buildRequest({
        botUserId: 'bot-1',
        lobbyCode: 'ABCD12',
      }),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mockGetRequestAuthUser).toHaveBeenCalledTimes(1)
  })

  it('accepts valid internal secret and reaches payload validation without auth lookup', async () => {
    const response = await POST(
      buildRequest(
        {
          lobbyCode: 'ABCD12',
        },
        {
          'X-Internal-Secret': 'test-internal-secret',
        }
      ),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Bot user ID required' })
    expect(mockGetRequestAuthUser).not.toHaveBeenCalled()
  })

  it('accepts authenticated external request and reaches payload validation', async () => {
    mockGetRequestAuthUser.mockResolvedValue({
      id: 'player-1',
      username: 'Player 1',
      suspended: false,
      isGuest: false,
    } as any)

    const response = await POST(
      buildRequest({
        lobbyCode: 'ABCD12',
      }),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Bot user ID required' })
    expect(mockGetRequestAuthUser).toHaveBeenCalledTimes(1)
  })

  it('returns sanitized 500 response when bot turn execution fails unexpectedly', async () => {
    mockGetRequestAuthUser.mockResolvedValue({
      id: 'player-1',
      username: 'Player 1',
      suspended: false,
      isGuest: false,
    } as any)

    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-123',
      state: JSON.stringify({
        players: [
          { id: 'player-1', score: 0 },
          { id: 'bot-1', score: 0 },
        ],
      }),
      status: 'playing',
      currentTurn: 0,
      players: [
        {
          id: 'db-player-1',
          userId: 'player-1',
          score: 0,
          scorecard: null,
          user: { id: 'player-1', bot: null },
        },
        {
          id: 'db-player-bot',
          userId: 'bot-1',
          score: 0,
          scorecard: null,
          user: { id: 'bot-1', bot: { id: 'bot-meta-1' } },
        },
      ],
      lobby: {
        id: 'lobby-123',
        code: 'ABCD12',
        gameType: 'tic_tac_toe',
      },
    } as any)
    mockRestoreGameEngine.mockImplementation(() => {
      throw new Error('sensitive bot engine failure')
    })

    const response = await POST(
      buildRequest({
        botUserId: 'bot-1',
        lobbyCode: 'ABCD12',
      }),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe('Internal server error')
    expect(payload.code).toBe('BOT_TURN_FAILED')
    expect(payload.details).toBeUndefined()
  })

  it('skips unchanged score writes and uses fast notify timeout for Tic-Tac-Toe bot turns', async () => {
    mockGetRequestAuthUser.mockResolvedValue({
      id: 'player-1',
      username: 'Player 1',
      suspended: false,
      isGuest: false,
    } as any)

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
      updatedAt: new Date().toISOString(),
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

    ;(prisma.games.findUnique as jest.Mock).mockResolvedValue({
      id: 'game-123',
      state: JSON.stringify(initialState),
      status: 'playing',
      currentTurn: 1,
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
        .mockReturnValueOnce(updatedState)
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

    const response = await POST(
      buildRequest({
        botUserId: 'bot-1',
        lobbyCode: 'ABCD12',
      }),
      { params: Promise.resolve({ gameId: 'game-123' }) }
    )

    expect(response.status).toBe(200)
    expect(prisma.games.update).toHaveBeenCalledTimes(1)
    expect(prisma.players.update).not.toHaveBeenCalled()
    expect(mockAppendGameReplaySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId: 'game-123',
        playerId: 'bot-1',
        actionType: 'bot:place',
      })
    )
    expect(mockNotifySocket).toHaveBeenCalledWith(
      'lobby:ABCD12',
      'game-update',
      expect.objectContaining({
        action: 'state-change',
      }),
      0,
      250
    )
  })
})
