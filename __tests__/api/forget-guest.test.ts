/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Route-level mocks are intentionally lightweight.

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/user/forget-guest/route'
import { prisma } from '@/lib/db'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'
import { detachFeedbackFrom, scrubPlayersFromGameRecords } from '@/lib/account-erasure'

const mockLogCalls: unknown[][] = []

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findFirst: jest.fn(), deleteMany: jest.fn() },
    players: { findFirst: jest.fn() },
  },
}))
jest.mock('@/lib/guest-auth', () => ({ getGuestClaimsFromRequest: jest.fn() }))
jest.mock('@/lib/account-erasure', () => ({
  scrubPlayersFromGameRecords: jest.fn(async () => ({ games: 2, snapshots: 5 })),
  detachFeedbackFrom: jest.fn(async () => 0),
}))
jest.mock('@/lib/csrf', () => ({ verifyCsrfToken: () => true }))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: () => () => Promise.resolve(null),
  rateLimitPresets: { auth: {} },
}))
jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({
    info: (...args: unknown[]) => mockLogCalls.push(args),
    warn: (...args: unknown[]) => mockLogCalls.push(args),
    error: (...args: unknown[]) => mockLogCalls.push(args),
  }),
}))

function request() {
  return new NextRequest('https://boardly.online/api/user/forget-guest', {
    method: 'POST',
    headers: { 'X-Guest-Token': 'guest.jwt' },
  })
}

describe('POST /api/user/forget-guest (#1129)', () => {
  beforeEach(() => {
    mockLogCalls.length = 0
    getGuestClaimsFromRequest.mockReturnValue({ guestId: 'guest-1', guestName: 'Ann' })
    prisma.users.findFirst.mockResolvedValue({ id: 'guest-1', username: 'Ann' })
    prisma.players.findFirst.mockResolvedValue(null)
    prisma.users.deleteMany.mockResolvedValue({ count: 1 })
  })

  afterEach(() => jest.clearAllMocks())

  it('erases the guest the token proves, names in games first, then the row', async () => {
    const res = await POST(request())

    expect(res.status).toBe(200)
    expect(prisma.users.findFirst).toHaveBeenCalledWith({
      where: { id: 'guest-1', isGuest: true },
      select: { id: true, username: true },
    })
    expect(scrubPlayersFromGameRecords).toHaveBeenCalledWith([{ id: 'guest-1', username: 'Ann' }])
    expect(detachFeedbackFrom).toHaveBeenCalledWith(['guest-1'])
    // isGuest in the delete itself: this route can never remove a registered account.
    expect(prisma.users.deleteMany).toHaveBeenCalledWith({ where: { id: 'guest-1', isGuest: true } })
    expect(scrubPlayersFromGameRecords.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.users.deleteMany.mock.invocationCallOrder[0]
    )
    expect(JSON.stringify(mockLogCalls)).not.toContain('Ann')
  })

  it('refuses without a valid guest token', async () => {
    getGuestClaimsFromRequest.mockReturnValue(null)

    const res = await POST(request())

    expect(res.status).toBe(401)
    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })

  it('answers 404 when the guest is already gone, which the client treats as done', async () => {
    prisma.users.findFirst.mockResolvedValue(null)

    const res = await POST(request())

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ code: 'GUEST_NOT_FOUND' })
    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })

  it('waits while the guest is seated in a running game', async () => {
    prisma.players.findFirst.mockResolvedValue({ id: 'p1' })

    const res = await POST(request())

    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toMatchObject({ code: 'GUEST_IN_ACTIVE_GAME' })
    expect(prisma.players.findFirst).toHaveBeenCalledWith({
      where: { userId: 'guest-1', leftAt: null, game: { status: 'playing' } },
      select: { id: true },
    })
    expect(scrubPlayersFromGameRecords).not.toHaveBeenCalled()
    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })
})
