/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      count: jest.fn(),
    },
    games: {
      count: jest.fn(),
    },
    lobbies: {
      count: jest.fn(),
    },
  },
}))

jest.mock('@/lib/admin-auth', () => ({
  requireAdminApiUser: jest.fn(),
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  logger: {
    error: jest.fn(),
  },
}))

import { GET } from '@/app/api/admin/overview/route'
import { prisma } from '@/lib/db'
import { requireAdminApiUser } from '@/lib/admin-auth'
import { AuthenticationError, AuthorizationError } from '@/lib/error-handler'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRequireAdminApiUser = requireAdminApiUser as jest.MockedFunction<typeof requireAdminApiUser>

describe('GET /api/admin/overview', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 for unauthenticated requests', async () => {
    mockRequireAdminApiUser.mockRejectedValue(new AuthenticationError('Unauthorized'))

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized')
    expect(mockPrisma.users.count).not.toHaveBeenCalled()
  })

  it('returns 403 for authenticated non-admin users', async () => {
    mockRequireAdminApiUser.mockRejectedValue(new AuthorizationError('Admin access required'))

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.error).toBe('Admin access required')
    expect(mockPrisma.users.count).not.toHaveBeenCalled()
  })

  it('returns admin dashboard stats for authorized admins', async () => {
    mockRequireAdminApiUser.mockResolvedValue({
      id: 'admin-1',
      role: 'admin',
      suspended: false,
      email: 'admin@example.com',
      username: 'admin',
    } as any)
    mockPrisma.users.count
      .mockResolvedValueOnce(100 as never)
      .mockResolvedValueOnce(25 as never)
      .mockResolvedValueOnce(3 as never)
    mockPrisma.games.count
      .mockResolvedValueOnce(45 as never)
      .mockResolvedValueOnce(6 as never)
    mockPrisma.lobbies.count
      .mockResolvedValueOnce(12 as never)
      .mockResolvedValueOnce(20 as never)

    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.stats).toEqual({
      totalUsers: 100,
      activeUsers24h: 25,
      suspendedUsers: 3,
      totalGames: 45,
      gamesInProgress: 6,
      activeLobbies: 12,
      totalLobbies: 20,
    })
    expect(typeof payload.generatedAt).toBe('string')
  })
})
