/**
 * @jest-environment @edge-runtime/jest-environment
 */
/**
 * PATCH /api/user/profile email change (#1136, audit S1-01): the caller proves
 * they own the account, not just a session cookie, and the address being
 * replaced is told. Plus the #1137 acceptance for this route: a suspension in
 * the database is refused on the next write while the token still says active.
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { comparePassword } from '@/lib/auth'
import { sendEmailChangeNoticeEmail, sendVerificationEmail } from '@/lib/email'
import { PATCH } from '@/app/api/user/profile/route'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    players: { count: jest.fn() },
    userAchievements: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  rateLimitPresets: { api: {}, auth: {} },
}))
jest.mock('@/lib/public-profile.server', () => ({
  ensureUserHasPublicProfileId: jest.fn(async () => 'public-id'),
}))
jest.mock('@/lib/email', () => ({
  sendVerificationEmail: jest.fn(async () => ({ success: true })),
  sendEmailChangeNoticeEmail: jest.fn(async () => ({ success: true })),
}))
jest.mock('@/lib/auth', () => ({ comparePassword: jest.fn() }))
jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'verification-token') }))
jest.mock('@/lib/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  return { apiLogger: jest.fn(() => log), logger: log }
})

const mockSession = getServerSession as jest.Mock
const findUnique = prisma.users.findUnique as jest.Mock
const mockCompare = comparePassword as jest.Mock
const mockNotice = sendEmailChangeNoticeEmail as jest.Mock
const mockVerification = sendVerificationEmail as jest.Mock

const USER_ID = 'user-1'

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: 'PlayerOne',
    email: 'old@example.com',
    pendingEmail: null,
    passwordHash: 'stored-hash',
    image: null,
    avatarUrl: null,
    emailVerified: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    publicProfileId: 'public-id',
    _count: { friendshipsInitiated: 0, friendshipsReceived: 0, players: 0, accounts: 0 },
    ...overrides,
  }
}

let row: ReturnType<typeof profileRow>
let suspendedInDb: boolean

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest('http://localhost:3000/api/user/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  row = profileRow()
  suspendedInDb = false
  mockSession.mockResolvedValue({
    user: { id: USER_ID, suspended: false, authenticatedAt: Date.now() - 60 * 60 * 1000 },
  })
  findUnique.mockImplementation(async (args) =>
    args.select?.suspended && Object.keys(args.select).length === 1
      ? { suspended: suspendedInDb }
      : row
  )
  ;(prisma.users.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.players.count as jest.Mock).mockResolvedValue(0)
  ;(prisma.userAchievements.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
    fn({
      emailVerificationTokens: { deleteMany: jest.fn(), create: jest.fn() },
      users: {
        update: jest.fn(async ({ data }) => ({ ...row, ...data })),
      },
    })
  )
})

describe('PATCH /api/user/profile - email change on a password account', () => {
  it('refuses without the current password and writes nothing', async () => {
    const response = await patch({ email: 'new@example.com' })
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.code).toBe('CURRENT_PASSWORD_REQUIRED')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(mockVerification).not.toHaveBeenCalled()
  })

  it('refuses a wrong current password with 403 and writes nothing', async () => {
    mockCompare.mockResolvedValue(false)

    const response = await patch({ email: 'new@example.com', currentPassword: 'guess' })
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.code).toBe('CURRENT_PASSWORD_INCORRECT')
    expect(mockCompare).toHaveBeenCalledWith('guess', 'stored-hash')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(mockNotice).not.toHaveBeenCalled()
  })

  it('accepts the right password, mails the new address and tells the old one', async () => {
    mockCompare.mockResolvedValue(true)

    const response = await patch({ email: 'new@example.com', currentPassword: 'Right1234' })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.emailChangePending).toBe(true)
    expect(mockVerification).toHaveBeenCalledWith('new@example.com', 'verification-token', 'PlayerOne')
    expect(mockNotice).toHaveBeenCalledWith('old@example.com', 'new@example.com', 'PlayerOne')
  })

  it('tells the client the account has a password, never the hash', async () => {
    mockCompare.mockResolvedValue(true)

    const payload = await (await patch({ email: 'new@example.com', currentPassword: 'Right1234' })).json()

    expect(payload.user.hasPassword).toBe(true)
    expect(JSON.stringify(payload)).not.toContain('stored-hash')
  })

  it('asks for no password when only the username changes', async () => {
    const response = await patch({ username: 'PlayerTwo' })

    expect(response.status).toBe(200)
    expect(mockCompare).not.toHaveBeenCalled()
    expect(mockNotice).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/user/profile - email change on an account without a password', () => {
  beforeEach(() => {
    row = profileRow({ passwordHash: null })
  })

  it('refuses a session that signed in more than ten minutes ago', async () => {
    const response = await patch({ email: 'new@example.com' })
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.code).toBe('RECENT_SIGN_IN_REQUIRED')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('accepts a fresh sign-in and still tells the old address', async () => {
    mockSession.mockResolvedValue({
      user: { id: USER_ID, suspended: false, authenticatedAt: Date.now() - 60 * 1000 },
    })

    const response = await patch({ email: 'new@example.com' })

    expect(response.status).toBe(200)
    expect(mockCompare).not.toHaveBeenCalled()
    expect(mockNotice).toHaveBeenCalledWith('old@example.com', 'new@example.com', 'PlayerOne')
  })
})

describe('PATCH /api/user/profile - suspended account (#1137)', () => {
  it('refuses the next write once the database says suspended, whatever the token says', async () => {
    suspendedInDb = true
    mockCompare.mockResolvedValue(true)

    const response = await patch({ username: 'PlayerTwo' })
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload.code).toBe('ACCOUNT_SUSPENDED')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
