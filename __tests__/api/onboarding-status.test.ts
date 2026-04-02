/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/onboarding/status/route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: {
    accountPreferences: { findUnique: jest.fn() },
  },
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/onboarding/status', { method: 'GET' })
}

describe('GET /api/onboarding/status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await GET(buildRequest())
    expect(res.status).toBe(401)
  })

  it('returns needsOnboarding: true when no AccountPreferences row exists', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue(null)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.needsOnboarding).toBe(true)
  })

  it('returns needsOnboarding: true when both timestamps are null', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: null,
      onboardingSkippedAt: null,
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.needsOnboarding).toBe(true)
  })

  it('returns needsOnboarding: false when onboardingCompletedAt is set', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: new Date('2026-01-01'),
      onboardingSkippedAt: null,
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.needsOnboarding).toBe(false)
  })

  it('returns needsOnboarding: false when onboardingSkippedAt is set', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: null,
      onboardingSkippedAt: new Date('2026-01-01'),
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.needsOnboarding).toBe(false)
  })
})
