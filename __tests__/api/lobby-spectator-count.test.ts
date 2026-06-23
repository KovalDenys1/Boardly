/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma and route mocks are intentionally lightweight in route tests.

import { NextRequest } from 'next/server'
import { PATCH } from '@/app/api/lobby/[code]/spectator-count/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    lobbies: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({
  getRequestAuthUser: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
  },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetRequestAuthUser = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

function patchRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/lobby/ABC123/spectator-count', {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/lobby/[code]/spectator-count', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when the request has no resolved session or guest identity', async () => {
    mockGetRequestAuthUser.mockResolvedValue(null)

    const response = await PATCH(patchRequest({ count: 5 }), {
      params: Promise.resolve({ code: 'ABC123' }),
    })

    expect(response.status).toBe(401)
    expect(mockPrisma.lobbies.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('returns 404 when lobby is not found', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1', username: 'viewer', isGuest: false })
    mockPrisma.lobbies.findUnique.mockResolvedValue(null)

    const response = await PATCH(patchRequest({ count: 5 }), {
      params: Promise.resolve({ code: 'ABC123' }),
    })

    expect(response.status).toBe(404)
  })

  it('returns 403 when spectators are disabled for the lobby', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1', username: 'viewer', isGuest: false })
    mockPrisma.lobbies.findUnique.mockResolvedValue({ id: 'lobby-1', allowSpectators: false })

    const response = await PATCH(patchRequest({ count: 5 }), {
      params: Promise.resolve({ code: 'ABC123' }),
    })

    expect(response.status).toBe(403)
    expect(mockPrisma.lobbies.update).not.toHaveBeenCalled()
  })

  it('updates spectatorCount when called by a resolved guest identity', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'guest-1', username: 'Guest', isGuest: true })
    mockPrisma.lobbies.findUnique.mockResolvedValue({ id: 'lobby-1', allowSpectators: true })
    mockPrisma.lobbies.update.mockResolvedValue({})

    const response = await PATCH(patchRequest({ count: 3 }), {
      params: Promise.resolve({ code: 'ABC123' }),
    })

    expect(response.status).toBe(200)
    expect(mockPrisma.lobbies.update).toHaveBeenCalledWith({
      where: { id: 'lobby-1' },
      data: { spectatorCount: 3 },
    })
  })

  it('returns 400 for an invalid count', async () => {
    mockGetRequestAuthUser.mockResolvedValue({ id: 'user-1', username: 'viewer', isGuest: false })

    const response = await PATCH(patchRequest({ count: -1 }), {
      params: Promise.resolve({ code: 'ABC123' }),
    })

    expect(response.status).toBe(400)
  })
})
