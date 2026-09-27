/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST, DELETE } from '@/app/api/push-subscriptions/route'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'

jest.mock('@/lib/db', () => ({
  prisma: {
    pushSubscriptions: {
      count: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/session-user', () => ({
  requireSessionUser: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => {
  const limiter = jest.fn(() => Promise.resolve(null))
  return {
    rateLimit: jest.fn(() => limiter),
    rateLimitPresets: { api: {} },
    __limiter: limiter,
  }
})

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockRequireSessionUser = requireSessionUser as jest.MockedFunction<typeof requireSessionUser>
const rateLimiterMock = (jest.requireMock('@/lib/rate-limit') as { __limiter: jest.Mock }).__limiter

function buildRequest(method: 'POST' | 'DELETE', body: unknown) {
  return new NextRequest('http://localhost:3000/api/push-subscriptions', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/push-subscriptions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    rateLimiterMock.mockImplementation(() => Promise.resolve(null))
    mockRequireSessionUser.mockResolvedValue({
      session: { user: { id: 'user-1' } },
    } as any)
    mockPrisma.pushSubscriptions.count.mockResolvedValue(0 as any)
    mockPrisma.pushSubscriptions.updateMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.pushSubscriptions.deleteMany.mockResolvedValue({ count: 0 } as any)
    mockPrisma.pushSubscriptions.create.mockResolvedValue({} as any)
  })

  describe('POST', () => {
    it('accepts a real push service endpoint', async () => {
      const response = await POST(
        buildRequest('POST', {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        })
      )

      expect(response.status).toBe(200)
      expect(mockPrisma.pushSubscriptions.create).toHaveBeenCalled()
    })

    // #1117 (audit S2-02): the acceptance case from the ticket.
    it('refuses a private-network IP endpoint', async () => {
      const response = await POST(
        buildRequest('POST', {
          endpoint: 'https://10.0.0.1:8443/x',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        })
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.pushSubscriptions.create).not.toHaveBeenCalled()
    })

    it('refuses an arbitrary https host', async () => {
      const response = await POST(
        buildRequest('POST', {
          endpoint: 'https://example.com/',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        })
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.pushSubscriptions.create).not.toHaveBeenCalled()
    })

    it('refuses a p256dh longer than the cap', async () => {
      const response = await POST(
        buildRequest('POST', {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'a'.repeat(201),
          auth: 'auth-key',
        })
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.pushSubscriptions.create).not.toHaveBeenCalled()
    })

    it('refuses an auth key longer than the cap', async () => {
      const response = await POST(
        buildRequest('POST', {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p256dh-key',
          auth: 'a'.repeat(101),
        })
      )

      expect(response.status).toBe(400)
      expect(mockPrisma.pushSubscriptions.create).not.toHaveBeenCalled()
    })

    it('requires sign-in', async () => {
      mockRequireSessionUser.mockResolvedValue({ response: new Response(null, { status: 401 }) } as any)

      const response = await POST(
        buildRequest('POST', {
          endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
          p256dh: 'p256dh-key',
          auth: 'auth-key',
        })
      )

      expect(response.status).toBe(401)
    })
  })

  describe('DELETE', () => {
    it('accepts a real push service endpoint', async () => {
      const response = await DELETE(
        buildRequest('DELETE', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' })
      )

      expect(response.status).toBe(200)
      expect(mockPrisma.pushSubscriptions.deleteMany).toHaveBeenCalled()
    })

    it('refuses a non-allowlisted endpoint', async () => {
      const response = await DELETE(buildRequest('DELETE', { endpoint: 'https://example.com/' }))

      expect(response.status).toBe(400)
      expect(mockPrisma.pushSubscriptions.deleteMany).not.toHaveBeenCalled()
    })
  })
})
