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
import { checkBotId } from 'botid/server'
import { __botProtectionTestUtils } from '@/lib/bot-protection'
import { recordServerReliabilityEvent } from '@/lib/server-operational-events'

jest.mock('botid/server', () => ({ checkBotId: jest.fn() }))
jest.mock('@/lib/server-operational-events', () => ({ recordServerReliabilityEvent: jest.fn() }))

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
const mockCheckBotId = checkBotId as jest.MockedFunction<typeof checkBotId>

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

  describe('Vercel BotID (#1157)', () => {
    const originalVercelEnv = process.env.VERCEL_ENV

    beforeEach(() => {
      process.env.VERCEL_ENV = 'production'
    })

    afterAll(() => {
      if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV
      else process.env.VERCEL_ENV = originalVercelEnv
    })

    it('refuses a request BotID classifies as a bot before any guest is minted', async () => {
      mockCheckBotId.mockResolvedValue({ isBot: true, isHuman: false, isVerifiedBot: false, bypassed: false })

      const response = await POST(buildRequest({ guestName: 'Scripted' }))

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toMatchObject({ code: 'BOT_CHECK_FAILED' })
      expect(mockCheckBotId).toHaveBeenCalledWith({ advancedOptions: { checkLevel: 'basic' } })
      expect(mockCreateGuestId).not.toHaveBeenCalled()
      expect(mockGetOrCreateGuestUser).not.toHaveBeenCalled()
    })

    it('does not ask BotID about a returning guest, whose refresh mints nothing', async () => {
      mockCheckBotId.mockResolvedValue({ isBot: true, isHuman: false, isVerifiedBot: false, bypassed: false })
      mockVerifyGuestToken.mockReturnValue({ guestId: 'guest-back', guestName: 'Back' })
      mockGetOrCreateGuestUser.mockResolvedValue({ id: 'guest-back', username: 'Back' } as never)

      const response = await POST(buildRequest({ guestName: 'Back', guestToken: 'session-token' }))

      expect(response.status).toBe(200)
      expect(mockCheckBotId).not.toHaveBeenCalled()
      expect(mockGetOrCreateGuestUser).toHaveBeenCalledWith('guest-back', 'Back', null, { createIfMissing: false })
    })

    it('lets a browser BotID vouches for through', async () => {
      mockCheckBotId.mockResolvedValue({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: false })
      mockGetOrCreateGuestUser.mockResolvedValue({ id: 'guest-user-1', username: 'Person' } as never)

      const response = await POST(buildRequest({ guestName: 'Person' }))

      expect(response.status).toBe(200)
    })

    describe('a flagged call in monitor mode', () => {
      const IPHONE_UA =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
      const mockRecord = recordServerReliabilityEvent as jest.MockedFunction<typeof recordServerReliabilityEvent>

      function flaggedRequest(): NextRequest {
        return new NextRequest('http://localhost:3000/api/auth/guest-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'user-agent': IPHONE_UA,
            'x-forwarded-for': '203.0.113.7, 10.0.0.1',
            'x-real-ip': '203.0.113.7',
            'x-vercel-forwarded-for': '203.0.113.7',
            'x-vercel-ip-country': 'NO',
            'x-is-human': '{"b":0,"v":"challenge"}',
            'x-path': '/api/auth/guest-session',
            'x-method': 'POST',
          },
          body: JSON.stringify({ guestName: 'Person' }),
        })
      }

      beforeEach(() => {
        process.env.BOTID_MODE = 'monitor'
        __botProtectionTestUtils.reset()
        mockCheckBotId.mockResolvedValue({
          isBot: true,
          isHuman: false,
          isVerifiedBot: false,
          verifiedBotName: undefined,
          verifiedBotCategory: undefined,
          bypassed: false,
          classificationReason: undefined,
        })
        mockGetOrCreateGuestUser.mockResolvedValue({ id: 'guest-user-1', username: 'Person' } as never)
      })

      afterEach(() => {
        delete process.env.BOTID_MODE
      })

      it('records the route, the challenge headers, the verdict, the mint, country, device and browser', async () => {
        const response = await POST(flaggedRequest())

        expect(response.status).toBe(200)
        expect(mockRecord).toHaveBeenCalledTimes(1)
        expect(mockRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName: 'botid_flagged',
            source: 'POST /api/auth/guest-session',
            payload: {
              route: 'POST /api/auth/guest-session',
              challengeHeaders: 'complete',
              isBot: true,
              isVerifiedBot: false,
              verifiedBotName: null,
              verifiedBotCategory: null,
              bypassed: false,
              classificationReason: null,
              mintedGuest: true,
              country: 'NO',
              device: 'mobile',
              browser: 'safari',
            },
          })
        )
      })

      it('writes no IP address, no User-Agent string and no guest id into the event', async () => {
        await POST(flaggedRequest())

        expect(mockRecord).toHaveBeenCalledTimes(1)
        const event = mockRecord.mock.calls[0][0]
        expect(event.payload).toEqual(expect.objectContaining({ device: 'mobile', browser: 'safari' }))

        const written = JSON.stringify(event)
        expect(written).not.toContain('203.0.113.7')
        expect(written).not.toContain('10.0.0.1')
        expect(written).not.toContain('iPhone OS')
        expect(written).not.toContain('Mozilla')
        expect(written).not.toContain('guest-user-1')
        expect(written).not.toContain('challenge"')
      })

      it('records that no guest was minted when the mint itself fails', async () => {
        mockGetOrCreateGuestUser.mockRejectedValue(new Error('database down'))

        const response = await POST(flaggedRequest())

        expect(response.status).toBe(500)
        expect(mockRecord).toHaveBeenCalledWith(
          expect.objectContaining({
            eventName: 'botid_flagged',
            payload: expect.objectContaining({ mintedGuest: false }),
          })
        )
      })
    })
  })
})
