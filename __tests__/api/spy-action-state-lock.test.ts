/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/game/[gameId]/spy-action/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
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

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
}))

jest.mock('@/lib/game-replay', () => ({
  appendGameReplaySnapshot: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/achievement-engine', () => ({
  checkAchievementsOnStatusChange: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const votedState = {
  players: [
    { id: 'player-1', score: 0 },
    { id: 'player-2', score: 0 },
    { id: 'player-3', score: 0 },
  ],
  status: 'playing',
  currentPlayerIndex: 0,
  lastMoveAt: Date.now(),
  data: { phase: 'VOTING', votes: { 'player-1': 'player-3' } },
}

jest.mock('@/lib/games/spy-game', () => ({
  SpyGame: jest.fn().mockImplementation(() => ({
    loadState: jest.fn(),
    makeMove: jest.fn(() => true),
    getState: jest.fn(() => votedState),
  })),
  sanitizeSpyStateForBroadcast: jest.fn((state: unknown) => state),
}))

const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockBroadcastToLobby = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
const mockAppendGameReplaySnapshot = appendGameReplaySnapshot as jest.MockedFunction<
  typeof appendGameReplaySnapshot
>

const GAME_UPDATED_AT = new Date('2026-09-17T10:00:00.000Z')

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/game/game-123/spy-action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'vote', data: { targetId: 'player-3' } }),
  })
}

/**
 * #993: every voter submits into the same phase at the same moment. The route
 * wrote on the primary key alone, so the last write replaced the others and the
 * losing vote vanished without anyone being told.
 */
describe('POST /api/game/[gameId]/spy-action optimistic lock', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
      state: JSON.stringify({ players: votedState.players, status: 'playing', data: { phase: 'VOTING', votes: {} } }),
      status: 'playing',
      gameType: 'guess_the_spy',
      currentTurn: 7,
      updatedAt: GAME_UPDATED_AT,
      startedAt: new Date('2026-09-17T09:55:00.000Z'),
      players: [
        { id: 'db-1', userId: 'player-1', score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, user: { id: 'player-1', username: 'Player 1', bot: null } },
        { id: 'db-2', userId: 'player-2', score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, user: { id: 'player-2', username: 'Player 2', bot: null } },
        { id: 'db-3', userId: 'player-3', score: 0, scorecard: null, finalScore: null, placement: null, isWinner: false, user: { id: 'player-3', username: 'Player 3', bot: null } },
      ],
      lobby: { id: 'lobby-1', code: 'ABCD12', gameType: 'guess_the_spy', creatorId: 'player-1' },
    } as any)
  })

  it('writes only while the row still carries the revision it read', async () => {
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 1 })

    const response = await POST(buildRequest(), { params: Promise.resolve({ gameId: 'game-123' }) })

    expect(response.status).toBe(200)
    expect(prisma.games.update).not.toHaveBeenCalled()
    expect(prisma.games.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'game-123', currentTurn: 7, updatedAt: GAME_UPDATED_AT },
      })
    )
  })

  it('answers 409 STATE_CONFLICT when another submission committed first', async () => {
    ;(prisma.games.updateMany as jest.Mock).mockResolvedValue({ count: 0 })

    const response = await POST(buildRequest(), { params: Promise.resolve({ gameId: 'game-123' }) })
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe('STATE_CONFLICT')
    // Nothing was written, so nothing may be announced or recorded either.
    expect(mockBroadcastToLobby).not.toHaveBeenCalled()
    expect(mockAppendGameReplaySnapshot).not.toHaveBeenCalled()
  })
})
