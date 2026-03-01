/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/cleanup/route'
import { cleanupStaleLobbiesAndGames } from '@/lib/lobby-health'

jest.mock('@/lib/lobby-health', () => ({
  cleanupStaleLobbiesAndGames: jest.fn(),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: {
    api: {},
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockCleanupStaleLobbiesAndGames = cleanupStaleLobbiesAndGames as jest.MockedFunction<
  typeof cleanupStaleLobbiesAndGames
>

describe('POST /api/lobby/cleanup', () => {
  const originalCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = 'cron-secret'
  })

  afterAll(() => {
    if (typeof originalCronSecret === 'string') {
      process.env.CRON_SECRET = originalCronSecret
    } else {
      delete process.env.CRON_SECRET
    }
  })

  it('rejects unauthenticated requests', async () => {
    const request = new NextRequest('http://localhost:3000/api/lobby/cleanup', {
      method: 'POST',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload.error).toBe('Unauthorized')
    expect(mockCleanupStaleLobbiesAndGames).not.toHaveBeenCalled()
  })

  it('allows trusted cron requests and executes cleanup', async () => {
    mockCleanupStaleLobbiesAndGames.mockResolvedValue({
      deactivatedLobbies: 2,
      cancelledWaitingGames: 1,
      abandonedPlayingGames: 1,
      scannedLobbies: 12,
      scannedActiveGames: 8,
    })

    const request = new NextRequest('http://localhost:3000/api/lobby/cleanup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer cron-secret',
      },
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      message: 'Cleanup completed',
      deactivatedCount: 2,
      cancelledWaitingGames: 1,
      abandonedPlayingGames: 1,
      scannedLobbies: 12,
      scannedActiveGames: 8,
    })
    expect(mockCleanupStaleLobbiesAndGames).toHaveBeenCalledTimes(1)
  })
})
