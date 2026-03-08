/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/bot-turn/route'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    games: {
      findUnique: jest.fn(),
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
})
