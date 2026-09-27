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
    users: { findUnique: jest.fn() },
  },
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

function buildRequest() {
  return new NextRequest('http://localhost:3000/api/onboarding/status', { method: 'GET' })
}

/** An account from before the age confirmation existed: never asked (#1135). */
const OLDER_ACCOUNT = { ageConfirmedAt: null, createdAt: new Date('2026-01-01T00:00:00Z'), isGuest: false }

describe('GET /api/onboarding/status', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.users.findUnique.mockResolvedValue(OLDER_ACCOUNT)
  })

  describe('age confirmation (#1135)', () => {
    const DONE = { onboardingCompletedAt: new Date('2026-09-27T10:00:00Z'), onboardingSkippedAt: null, profileVisibility: 'public' }

    it('asks a new OAuth account that has not confirmed, and keeps onboarding open after a skip', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.accountPreferences.findUnique.mockResolvedValue({ ...DONE, onboardingCompletedAt: null, onboardingSkippedAt: new Date() } as any)
      mockPrisma.users.findUnique.mockResolvedValue({ ageConfirmedAt: null, createdAt: new Date('2026-09-28T09:00:00Z'), isGuest: false })
      const body = await (await GET(buildRequest())).json()
      expect(body).toMatchObject({ needsOnboarding: true, needsAgeConfirmation: true })
    })

    it('does not ask an account that confirmed at sign-up', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.accountPreferences.findUnique.mockResolvedValue(DONE as any)
      mockPrisma.users.findUnique.mockResolvedValue({
        ageConfirmedAt: new Date('2026-09-28T09:00:00Z'),
        createdAt: new Date('2026-09-28T09:00:00Z'),
        isGuest: false,
      })
      const body = await (await GET(buildRequest())).json()
      expect(body).toMatchObject({ needsOnboarding: false, needsAgeConfirmation: false })
    })

    it('does not ask an account created before the confirmation existed', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.accountPreferences.findUnique.mockResolvedValue(DONE as any)
      const body = await (await GET(buildRequest())).json()
      expect(body).toMatchObject({ needsOnboarding: false, needsAgeConfirmation: false })
    })
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

  it('reports a new account\'s friends-only profile, which onboarding offers to open (#1131)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue({
      onboardingCompletedAt: null,
      onboardingSkippedAt: null,
      profileVisibility: 'friends',
    } as any)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body).toEqual({ needsOnboarding: true, needsAgeConfirmation: false, profileVisibility: 'friends' })
  })

  it('reports an account with no preferences row as public, as it always was (#1131)', async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
    mockPrisma.accountPreferences.findUnique.mockResolvedValue(null)
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(body.profileVisibility).toBe('public')
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
