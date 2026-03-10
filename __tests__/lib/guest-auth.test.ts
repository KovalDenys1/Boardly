import jwt from 'jsonwebtoken'
import {
  createGuestId,
  createGuestToken,
  getGuestClaimsFromRequest,
  getGuestTokenFromRequest,
  verifyGuestToken,
} from '@/lib/guest-auth'

describe('guest-auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.restoreAllMocks()
    process.env = {
      ...originalEnv,
      NEXTAUTH_SECRET: 'test-nextauth-secret',
    }
    delete process.env.GUEST_JWT_SECRET
    delete process.env.GUEST_JWT_EXPIRES_IN
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('creates guest ids with the expected prefix', () => {
    expect(createGuestId()).toMatch(/^guest-[0-9a-f-]+$/i)
  })

  it('creates and verifies guest tokens using NEXTAUTH_SECRET fallback', () => {
    const token = createGuestToken('guest-123', 'Alice')
    const claims = verifyGuestToken(token)

    expect(claims).toMatchObject({
      guestId: 'guest-123',
      guestName: 'Alice',
    })
    expect(typeof claims?.expiresAt).toBe('number')
  })

  it('prefers GUEST_JWT_SECRET when configured', () => {
    process.env.GUEST_JWT_SECRET = 'guest-secret-only'

    const token = createGuestToken('guest-456', 'Bob')
    const claims = verifyGuestToken(token)

    expect(claims).toMatchObject({
      guestId: 'guest-456',
      guestName: 'Bob',
    })
  })

  it('returns null for expired guest tokens', async () => {
    process.env.GUEST_JWT_EXPIRES_IN = '1ms'
    const token = createGuestToken('guest-expired', 'Late Guest')

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(verifyGuestToken(token)).toBeNull()
  })

  it('returns null for tampered tokens', () => {
    const token = createGuestToken('guest-789', 'Mallory')
    const tampered = `${token.slice(0, -1)}x`

    expect(verifyGuestToken(tampered)).toBeNull()
  })

  it('returns null for non-guest tokens', () => {
    const token = jwt.sign(
      { type: 'user', guestName: 'Charlie' },
      process.env.NEXTAUTH_SECRET as string,
      { issuer: 'boardly-guest', subject: 'guest-user' }
    )

    expect(verifyGuestToken(token)).toBeNull()
  })

  it('throws when no guest JWT secret is configured', () => {
    delete process.env.NEXTAUTH_SECRET
    delete process.env.GUEST_JWT_SECRET

    expect(() => createGuestToken('guest-1', 'No Secret')).toThrow('Missing guest JWT secret')
  })

  it('extracts guest token from X-Guest-Token before Authorization', () => {
    const request = new Request('http://localhost:3000', {
      headers: {
        'X-Guest-Token': 'header-token',
        Authorization: 'Bearer bearer-token',
      },
    })

    expect(getGuestTokenFromRequest(request)).toBe('header-token')
  })

  it('extracts guest token from Authorization bearer header when needed', () => {
    const request = new Request('http://localhost:3000', {
      headers: {
        Authorization: 'Bearer bearer-token',
      },
    })

    expect(getGuestTokenFromRequest(request)).toBe('bearer-token')
  })

  it('returns verified claims from a request', () => {
    const token = createGuestToken('guest-claims', 'Claims User')
    const request = new Request('http://localhost:3000', {
      headers: {
        'X-Guest-Token': token,
      },
    })

    expect(getGuestClaimsFromRequest(request)).toMatchObject({
      guestId: 'guest-claims',
      guestName: 'Claims User',
    })
  })
})
