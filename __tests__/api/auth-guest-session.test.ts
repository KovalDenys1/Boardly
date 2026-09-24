/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/auth/guest-session/route'
import {
  createGuestId,
  createGuestToken,
  getGuestTokenFromRequest,
  verifyGuestToken,
} from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(async () => null)),
  rateLimitPresets: {
    auth: {},
  },
}))

jest.mock('@/lib/guest-auth', () => ({
  createGuestId: jest.fn(),
  createGuestToken: jest.fn(),
  createGuestIdentityToken: jest.fn(() => 'identity-token'),
  getGuestTokenFromRequest: jest.fn(),
  verifyGuestToken: jest.fn(),
  verifyGuestIdentityToken: jest.fn(() => null),
}))

jest.mock('@/lib/guest-helpers', () => ({
  getOrCreateGuestUser: jest.fn(),
}))

jest.mock('@/lib/error-handler', () => ({
  handleApiError: jest.fn(() => {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }),
}))

const mockCreateGuestId = createGuestId as jest.MockedFunction<typeof createGuestId>
const mockCreateGuestToken = createGuestToken as jest.MockedFunction<typeof createGuestToken>
const mockGetGuestTokenFromRequest =
  getGuestTokenFromRequest as jest.MockedFunction<typeof getGuestTokenFromRequest>
const mockVerifyGuestToken = verifyGuestToken as jest.MockedFunction<typeof verifyGuestToken>
const mockGetOrCreateGuestUser = getOrCreateGuestUser as jest.MockedFunction<typeof getOrCreateGuestUser>

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/auth/guest-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/guest-session', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateGuestId.mockReturnValue('guest-id-1')
    mockCreateGuestToken.mockReturnValue('guest-token-1')
    mockGetGuestTokenFromRequest.mockReturnValue(null)
    mockVerifyGuestToken.mockReturnValue(null)
  })

  it('rejects names containing disallowed Unicode control characters', async () => {
    const response = await POST(
      buildRequest({
        guestName: 'bad\u202Ename',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Guest name must be 2-20 characters' })
    expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
  })

  it('accepts names with word characters, spaces, and hyphens', async () => {
    mockGetOrCreateGuestUser.mockResolvedValue({
      id: 'guest-user-1',
      username: 'Guest_Name-2',
    } as any)

    const response = await POST(
      buildRequest({
        guestName: 'Guest_Name-2',
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      guestIdentityToken: 'identity-token',
      guestId: 'guest-user-1',
      guestName: 'Guest_Name-2',
      guestToken: 'guest-token-1',
    })
    expect(mockGetOrCreateGuestUser).toHaveBeenCalledWith('guest-id-1', 'Guest_Name-2', null)
    expect(mockCreateGuestToken).toHaveBeenCalledWith('guest-user-1', 'Guest_Name-2')
  })

  it('answers 404 instead of re-creating a guest whose row is gone (#1155)', async () => {
    // The identity token outlived the row (purged, or "Forget me"). Re-creating
    // it under the same id would hand the device back a deleted identity.
    mockVerifyGuestToken.mockReturnValue({ guestId: 'guest-gone', guestName: 'Gone' })
    mockGetOrCreateGuestUser.mockResolvedValue(null as never)

    const response = await POST(buildRequest({ guestName: 'Gone', guestToken: 'session-token' }))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({ code: 'GUEST_NOT_FOUND' })
    expect(mockGetOrCreateGuestUser).toHaveBeenCalledWith('guest-gone', 'Gone', null, { createIfMissing: false })
    expect(mockCreateGuestId).not.toHaveBeenCalled()
    expect(mockCreateGuestToken).not.toHaveBeenCalled()
  })

  it('still resolves a returning guest whose row exists', async () => {
    mockVerifyGuestToken.mockReturnValue({ guestId: 'guest-back', guestName: 'Back' })
    mockCreateGuestToken.mockReturnValue('guest-token-2')
    mockGetOrCreateGuestUser.mockResolvedValue({ id: 'guest-back', username: 'Back' } as never)

    const response = await POST(buildRequest({ guestName: 'Back', guestToken: 'session-token' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ guestId: 'guest-back' })
  })
})
