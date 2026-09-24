import jwt from 'jsonwebtoken'
import {
  createGuestId,
  createGuestToken,
  createGuestIdentityToken,
  GUEST_IDENTITY_TTL_DAYS,
  getGuestClaimsFromRequest,
  getGuestTokenFromRequest,
  verifyGuestToken,
  verifyGuestIdentityToken,
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

describe('guest identity token (#818)', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, NEXTAUTH_SECRET: 'test-nextauth-secret' }
    delete process.env.GUEST_JWT_SECRET
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('resolves back to the same guest, so a returning visitor is not a new person', () => {
    const token = createGuestIdentityToken('guest-1')
    expect(verifyGuestIdentityToken(token)).toBe('guest-1')
  })

  it('cannot be used where a session token is expected', () => {
    // It carries identity only. If it authorised requests, a long-lived bearer
    // credential in localStorage would be a much bigger prize than a 12h one.
    const identity = createGuestIdentityToken('guest-1')
    expect(verifyGuestToken(identity)).toBeNull()
  })

  it('does not accept a session token as proof of identity', () => {
    const session = createGuestToken('guest-1', 'Ann')
    expect(verifyGuestIdentityToken(session)).toBeNull()
  })

  it('rejects a forged token', () => {
    expect(verifyGuestIdentityToken('not-a-token')).toBeNull()
  })

  it('lives no longer than a played guest is retained (#1155)', () => {
    // 90 = PLAYED_GUEST_CLEANUP_DAYS in scripts/cleanup-old-guests.ts, pinned as
    // a literal so moving either number alone fails here. At 180 days the
    // device held a credential for a row the purge had already deleted.
    delete process.env.GUEST_IDENTITY_EXPIRES_IN
    const decoded = jwt.decode(createGuestIdentityToken('guest-1')) as jwt.JwtPayload

    expect(GUEST_IDENTITY_TTL_DAYS).toBe(90)
    expect(((decoded.exp as number) - (decoded.iat as number)) / 86_400).toBe(90)
  })
})
