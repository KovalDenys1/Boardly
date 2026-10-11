/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { GET } from '@/app/api/lobby/[code]/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { __rateLimitTestUtils, rateLimitPresets } from '@/lib/rate-limit'

jest.mock('@/lib/db', () => ({
  prisma: { lobbies: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() })),
}))

const mockAuth = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>

function readFromHomeNetwork() {
  return GET(
    new NextRequest('http://localhost:3000/api/lobby/ABCD?includeFinished=true', {
      headers: { 'x-real-ip': '198.51.100.7' },
    }),
    { params: Promise.resolve({ code: 'ABCD' }) }
  )
}

describe('GET /api/lobby/[code] read budget', () => {
  beforeEach(() => {
    __rateLimitTestUtils.clearInMemoryStore()
    ;(prisma.lobbies.findUnique as jest.Mock).mockResolvedValue(null)
  })
  afterAll(() => __rateLimitTestUtils.clearInMemoryStore())

  it('gives each player their own budget, so friends on one router keep their waiting room live', async () => {
    mockAuth.mockResolvedValue({ id: 'guest-a', username: 'A', isGuest: true })
    const limit = rateLimitPresets.game.maxRequests
    for (let i = 0; i < limit; i += 1) {
      expect((await readFromHomeNetwork()).status).not.toBe(429)
    }
    expect((await readFromHomeNetwork()).status).toBe(429)

    mockAuth.mockResolvedValue({ id: 'guest-b', username: 'B', isGuest: true })
    expect((await readFromHomeNetwork()).status).not.toBe(429)
  })
})
