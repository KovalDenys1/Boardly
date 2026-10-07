/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/forgot-password/route'
import { prisma } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { hashAuthToken, passwordResetTokensOf } from '@/lib/auth-tokens'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
    },
    passwordResetTokens: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))

// Six requests from one address would trip the real 5-per-15-minutes limiter; the
// limiter has its own tests.
jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  failClosedAuthPreset: {},
}))

const mockReserveMail = jest.fn(
  async (..._args: unknown[]): Promise<{ allowed: boolean; reason?: string }> => ({ allowed: true })
)
jest.mock('@/lib/email-send-guard', () => ({
  reserveTransactionalMailSend: (...args: unknown[]) => mockReserveMail(...args),
}))

jest.mock('@/lib/email', () => ({
  sendPasswordResetEmail: jest.fn(),
}))

// The work an existing account triggers runs after the response (#1142). Collect it so
// a test can wait for it, and so it is visible that the response did not.
const mockPendingAfterResponse: Promise<unknown>[] = []
jest.mock('@/lib/after-response', () => ({
  runAfterResponse: (work: Promise<unknown>) => {
    mockPendingAfterResponse.push(work)
  },
}))
async function flushAfterResponse() {
  await Promise.all(mockPendingAfterResponse.splice(0))
}

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSendPasswordResetEmail = sendPasswordResetEmail as jest.MockedFunction<typeof sendPasswordResetEmail>

function buildRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/auth/forgot-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

const genericSuccessMessage =
  'If an account exists with that email, you will receive password reset instructions.'

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPendingAfterResponse.splice(0)
    mockSendPasswordResetEmail.mockResolvedValue({ success: true })
  })

  it('returns validation error for invalid email input', async () => {
    const response = await POST(buildRequest({ email: 'bad-email' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Invalid email address')
  })

  it('returns generic success for non-existent users to prevent enumeration', async () => {
    mockPrisma.users.findFirst.mockResolvedValue(null)

    const response = await POST(buildRequest({ email: 'missing@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
    expect(mockPrisma.passwordResetTokens.create).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('returns generic success when the initial DB lookup fails', async () => {
    mockPrisma.users.findFirst.mockRejectedValue(new Error('db offline'))

    const response = await POST(buildRequest({ email: 'user@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
  })

  it('writes the reset mail in Norwegian when the request asks for Norwegian (#1298)', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({ id: 'user-1', email: 'user@example.com' } as any)
    const request = new NextRequest('http://localhost:3000/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'nb-NO,nb;q=0.9,en;q=0.6' },
      body: JSON.stringify({ email: 'user@example.com' }),
    })

    await POST(request)
    await flushAfterResponse()

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('user@example.com', expect.any(String), 'nb')
  })

  it('writes the reset mail in the language stored on the account, over Accept-Language (#1331)', async () => {
    const requestIn = (acceptLanguage: string) =>
      new NextRequest('http://localhost:3000/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Language': acceptLanguage },
        body: JSON.stringify({ email: 'user@example.com' }),
      })

    mockPrisma.users.findFirst.mockResolvedValue({ id: 'user-1', email: 'user@example.com', language: 'no' } as any)
    await POST(requestIn('en-US,en;q=0.9'))
    await flushAfterResponse()
    expect(mockSendPasswordResetEmail).toHaveBeenLastCalledWith('user@example.com', expect.any(String), 'nb')

    mockPrisma.users.findFirst.mockResolvedValue({ id: 'user-1', email: 'user@example.com', language: 'ru' } as any)
    await POST(requestIn('nb-NO,nb;q=0.9'))
    await flushAfterResponse()
    expect(mockSendPasswordResetEmail).toHaveBeenLastCalledWith('user@example.com', expect.any(String), 'en')
  })

  it('creates a new reset token and sends email for existing users', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    } as any)

    const response = await POST(buildRequest({ email: 'USER@example.com' }))
    const payload = await response.json()
    await flushAfterResponse()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
    // Only this user's reset tokens are replaced; a pending deletion link survives (#1141).
    expect(mockPrisma.passwordResetTokens.deleteMany).toHaveBeenCalledWith({
      where: passwordResetTokensOf('user-1', 'reset'),
    })
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith('user@example.com', expect.any(String), 'en')

    // The row holds the hash of the emailed token and nothing that matches it (#1141).
    const emailedToken = mockSendPasswordResetEmail.mock.calls[0][1]
    expect(emailedToken).toMatch(/^[0-9a-f]{64}$/)
    expect(mockPrisma.passwordResetTokens.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash: hashAuthToken(emailedToken),
        purpose: 'reset',
        expires: expect.any(Date),
      },
    })
    expect(JSON.stringify(mockPrisma.passwordResetTokens.create.mock.calls)).not.toContain(emailedToken)
  })

  it('still returns generic success when sending the reset email fails', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    } as any)
    mockSendPasswordResetEmail.mockResolvedValue({
      success: false,
      error: 'provider unavailable',
    })

    const response = await POST(buildRequest({ email: 'user@example.com' }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
  })

  it('answers generically and rotates nothing when the mail guard refuses (#1158)', async () => {
    mockPrisma.users.findFirst.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    } as any)
    mockReserveMail.mockResolvedValueOnce({ allowed: false, reason: 'address_daily_cap' })

    const response = await POST(buildRequest({ email: 'user@example.com' }))
    const payload = await response.json()
    await flushAfterResponse()

    expect(response.status).toBe(200)
    expect(payload.message).toBe(genericSuccessMessage)
    expect(mockReserveMail).toHaveBeenCalledWith('password_reset', 'user@example.com')
    // The link already in the inbox stays valid.
    expect(mockPrisma.passwordResetTokens.deleteMany).not.toHaveBeenCalled()
    expect(mockPrisma.passwordResetTokens.create).not.toHaveBeenCalled()
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
  })
  // #1142: an existing address and an unknown one both answer right after the one
  // lookup, so response time says nothing about which addresses have accounts.
  describe('enumeration by timing (#1142)', () => {
    it('answers before the reset mail is sent', async () => {
      mockPrisma.users.findFirst.mockResolvedValue({ id: 'user-1', email: 'user@example.com' } as any)
      let releaseSend: (value: { success: boolean }) => void = () => {}
      mockSendPasswordResetEmail.mockReturnValue(new Promise((resolve) => { releaseSend = resolve }) as any)

      const response = await POST(buildRequest({ email: 'user@example.com' }))

      expect(response.status).toBe(200)
      expect((await response.json()).message).toBe(genericSuccessMessage)
      expect(mockPendingAfterResponse).toHaveLength(1)

      releaseSend({ success: true })
      await flushAfterResponse()
      expect(mockSendPasswordResetEmail).toHaveBeenCalledTimes(1)
    })

    it('answers 200, not 500, when writing the token fails for an existing account', async () => {
      mockPrisma.users.findFirst.mockResolvedValue({ id: 'user-1', email: 'user@example.com' } as any)
      mockPrisma.passwordResetTokens.create.mockRejectedValueOnce(new Error('db write failed'))

      const response = await POST(buildRequest({ email: 'user@example.com' }))
      await flushAfterResponse()

      expect(response.status).toBe(200)
      expect((await response.json()).message).toBe(genericSuccessMessage)
      expect(mockSendPasswordResetEmail).not.toHaveBeenCalled()
    })

    it('does no work after the response for an unknown address', async () => {
      mockPrisma.users.findFirst.mockResolvedValue(null)

      await POST(buildRequest({ email: 'missing@example.com' }))

      expect(mockPendingAfterResponse).toHaveLength(0)
      expect(mockReserveMail).not.toHaveBeenCalled()
    })
  })
})
