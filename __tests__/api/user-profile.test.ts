/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { ensureUserHasPublicProfileId } from '@/lib/public-profile.server'
import { GET } from '@/app/api/user/profile/route'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
    },
    players: {
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/public-profile.server', () => ({
  ensureUserHasPublicProfileId: jest.fn(),
}))

jest.mock('@/lib/error-handler', () => {
  class AuthenticationError extends Error {
    statusCode = 401
  }
  class ConflictError extends Error {
    statusCode = 409
  }
  class ValidationError extends Error {
    statusCode = 400
  }

  return {
    AuthenticationError,
    ConflictError,
    ValidationError,
    withErrorHandler:
      (handler: (request: NextRequest) => Promise<Response>) => async (request: NextRequest) => {
        try {
          return await handler(request)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Error' },
            { status: (error as any)?.statusCode || 500 }
          )
        }
      },
  }
})

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/email', () => ({
  sendVerificationEmail: jest.fn(),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockEnsureUserHasPublicProfileId =
  ensureUserHasPublicProfileId as jest.MockedFunction<typeof ensureUserHasPublicProfileId>

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/user/profile')
}

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockEnsureUserHasPublicProfileId.mockResolvedValue('generated-public-id')
    mockPrisma.users.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'Player One',
      email: 'player@example.com',
      pendingEmail: null,
      image: null,
      emailVerified: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      publicProfileId: null,
      _count: {
        friendshipsInitiated: 1,
        friendshipsReceived: 2,
        players: 8,
        accounts: 1,
      },
    } as any)
    mockPrisma.players.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2)
  })

  it('returns achievement stats based on finished games and wins', async () => {
    const response = await GET(buildRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockPrisma.players.count).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        game: {
          status: 'finished',
        },
      },
    })
    expect(mockPrisma.players.count).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-1',
        isWinner: true,
        game: {
          status: 'finished',
        },
      },
    })
    expect(payload.user).toMatchObject({
      publicProfileId: 'generated-public-id',
      friendsCount: 3,
      gamesPlayed: 8,
      linkedAccountsCount: 1,
      achievementStats: {
        completedGamesCount: 5,
        winsCount: 2,
      },
    })
  })
})
