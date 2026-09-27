/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { PATCH } from '@/app/api/onboarding/route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: {
    accountPreferences: { upsert: jest.fn() },
    // lib/session-user re-reads `suspended` on a write (#1137).
    users: { findUnique: jest.fn(async () => ({ suspended: false })), updateMany: jest.fn() },
  },
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.accountPreferences.upsert.mockResolvedValue({} as any)
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await PATCH(buildRequest({ action: 'complete' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid action', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'invalid' }))
    expect(res.status).toBe(400)
  })

  it('upserts onboardingCompletedAt when action is complete', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'complete' }))
    expect(res.status).toBe(204)
    expect(mockPrisma.accountPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ onboardingCompletedAt: expect.any(Date) }),
      })
    )
  })

  it('creates a missing row with the values an older account always had (#1131)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    await PATCH(buildRequest({ action: 'complete' }))
    expect(mockPrisma.accountPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ profileVisibility: 'public', showOnlineStatus: true }),
      })
    )
  })

  it('opens the profile only when the account step ticked it (#1131)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'account', profilePublic: true }))
    expect(res.status).toBe(204)
    expect(mockPrisma.accountPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: { profileVisibility: 'public' },
      })
    )
  })

  it('writes nothing for an account step left unticked (#1131)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'account', profilePublic: false }))
    expect(res.status).toBe(204)
    expect(mockPrisma.accountPreferences.upsert).not.toHaveBeenCalled()
    expect(mockPrisma.users.updateMany).not.toHaveBeenCalled()
  })

  it('stamps the age confirmation once, never over an earlier one (#1135)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'account', ageConfirmed: true }))
    expect(res.status).toBe(204)
    expect(mockPrisma.users.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', ageConfirmedAt: null },
      data: { ageConfirmedAt: expect.any(Date) },
    })
    expect(mockPrisma.accountPreferences.upsert).not.toHaveBeenCalled()
  })

  it('upserts onboardingSkippedAt when action is skip', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    const res = await PATCH(buildRequest({ action: 'skip' }))
    expect(res.status).toBe(204)
    expect(mockPrisma.accountPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ onboardingSkippedAt: expect.any(Date) }),
      })
    )
  })
})
