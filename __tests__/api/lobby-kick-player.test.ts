/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are intentionally loose here

import { NextRequest } from 'next/server'
import { POST as KICK_PLAYER } from '@/app/api/lobby/[code]/kick-player/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: jest.fn(),
    lobbies: {
      findUnique: jest.fn(),
      update: jest.fn(() => ({ __op: 'lobbies.update' })),
    },
    players: {
      delete: jest.fn(() => ({ __op: 'players.delete' })),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { api: {} },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/supabase-server', () => ({
  broadcastToLobby: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

const TARGET_PLAYER_ID = '11111111-1111-4111-8111-111111111111'

function kickRequest() {
  return new NextRequest('http://localhost:3000/api/lobby/ABC123/kick-player', {
    method: 'POST',
    body: JSON.stringify({ playerId: TARGET_PLAYER_ID }),
  })
}

describe('POST /api/lobby/[code]/kick-player', () => {
  const lobby = {
    id: 'lobby-1',
    code: 'ABC123',
    creatorId: 'host-1',
    games: [
      {
        id: 'game-1',
        status: 'waiting',
        players: [
          { id: 'player-host', userId: 'host-1', user: { username: 'host' } },
          { id: TARGET_PLAYER_ID, userId: 'griefer-1', user: { username: 'griefer' } },
        ],
      },
    ],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetRequestAuthUser.mockResolvedValue({ id: 'host-1' } as any)
    mockPrisma.lobbies.findUnique.mockResolvedValue(lobby as any)
    mockPrisma.$transaction.mockResolvedValue([{}, {}] as any)
  })

  it('records the kick alongside the removal so it survives the player re-opening the link (#1013)', async () => {
    const response = await KICK_PLAYER(kickRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(200)
    // One transaction: a delete that commits without the record is the bug this fixes.
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    expect(mockPrisma.players.delete).toHaveBeenCalledWith({ where: { id: TARGET_PLAYER_ID } })
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith({
      where: { id: 'lobby-1' },
      data: { kickedUserIds: { push: 'griefer-1' } },
    })
  })

  it('records nothing when the caller is not the host', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'griefer-1' } as any)

    const response = await KICK_PLAYER(kickRequest(), { params: { code: 'ABC123' } as any })

    expect(response.status).toBe(403)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })
})
