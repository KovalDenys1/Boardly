/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { POST } from '@/app/api/user/accept-terms/route'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { api: {} },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}))

const mockAuth = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

const request = () => new NextRequest('http://localhost:3000/api/user/accept-terms', { method: 'POST' })

describe('POST /api/user/accept-terms (#1466)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('records the acceptance for a guest and returns the stored date', async () => {
    const accepted = new Date('2026-10-18T10:00:00.000Z')
    mockAuth.mockResolvedValue({ id: 'guest-1', username: 'Fen', isGuest: true })
    mockPrisma.users.updateMany.mockResolvedValue({ count: 1 })
    mockPrisma.users.findUnique.mockResolvedValue({ termsAcceptedAt: accepted })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ termsAcceptedAt: '2026-10-18T10:00:00.000Z' })
    expect(mockPrisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 'guest-1', termsAcceptedAt: null },
      data: { termsAcceptedAt: expect.any(Date) },
    })
    expect(mockPrisma.users.findUnique).toHaveBeenCalledWith({
      where: { id: 'guest-1' },
      select: { termsAcceptedAt: true },
    })
  })

  it('keeps the first date when it is called again', async () => {
    const first = new Date('2026-10-01T08:30:00.000Z')
    mockAuth.mockResolvedValue({ id: 'user-1', username: 'Bea', isGuest: false })
    mockPrisma.users.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.users.findUnique.mockResolvedValue({ termsAcceptedAt: first })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ termsAcceptedAt: '2026-10-01T08:30:00.000Z' })
  })

  it('answers 401 without a session or a guest token, and writes nothing', async () => {
    mockAuth.mockResolvedValue(null)

    const response = await POST(request())

    expect(response.status).toBe(401)
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled()
    expect(mockPrisma.users.findUnique).not.toHaveBeenCalled()
  })

  it('answers 404 when the account vanished between the write and the read', async () => {
    mockAuth.mockResolvedValue({ id: 'guest-1', username: 'Fen', isGuest: true })
    mockPrisma.users.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.users.findUnique.mockResolvedValue(null)

    const response = await POST(request())

    expect(response.status).toBe(404)
  })
})
