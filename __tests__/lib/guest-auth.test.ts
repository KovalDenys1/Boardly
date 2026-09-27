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
import { NEXTAUTH_SECRET_FALLBACK_CUTOFF } from '@/lib/nextauth-secret-transition'

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

describe('GUEST_JWT_SECRET transition off NEXTAUTH_SECRET (#1142, #1149)', () => {
  const originalEnv = process.env
  const NEXTAUTH = 'test-nextauth-secret-at-least-32-characters'
  const DEDICATED = 'test-guest-jwt-secret-at-least-32-characters'

  // Mid-transition, the last second of it, and its first second after.
  const DURING = new Date('2026-10-01T12:00:00.000Z')
  const LAST_SECOND = new Date('2026-12-26T23:59:59.000Z')
  const CUTOFF = new Date('2026-12-27T00:00:00.000Z')

  /** A token as production minted it before GUEST_JWT_SECRET was set. */
  function mintBeforeTheSwitch<T>(mint: () => T): T {
    const dedicated = process.env.GUEST_JWT_SECRET
    delete process.env.GUEST_JWT_SECRET
    try {
      return mint()
    } finally {
      if (dedicated !== undefined) process.env.GUEST_JWT_SECRET = dedicated
    }
  }

  beforeEach(() => {
    process.env = { ...originalEnv, NEXTAUTH_SECRET: NEXTAUTH }
    delete process.env.GUEST_JWT_SECRET
    delete process.env.GUEST_JWT_EXPIRES_IN
    delete process.env.GUEST_IDENTITY_EXPIRES_IN
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('pins the cutoff at 2026-12-27, ninety days after the first day the secret can be set', () => {
    expect(NEXTAUTH_SECRET_FALLBACK_CUTOFF).toBe('2026-12-27')
    const days = (Date.parse('2026-12-27') - Date.parse('2026-09-28')) / 86_400_000
    expect(days).toBe(GUEST_IDENTITY_TTL_DAYS)
  })

  describe('without GUEST_JWT_SECRET', () => {
    it.each([
      ['during the transition', DURING],
      ['after the cutoff', new Date('2027-02-01T00:00:00.000Z')],
    ])('signs and verifies with NEXTAUTH_SECRET %s, which is still the current secret', (_label, now) => {
      jest.useFakeTimers({ now })

      const session = createGuestToken('guest-1', 'Ann')
      const identity = createGuestIdentityToken('guest-1')

      expect(() => jwt.verify(session, NEXTAUTH)).not.toThrow()
      expect(verifyGuestToken(session)).toMatchObject({ guestId: 'guest-1', guestName: 'Ann' })
      expect(verifyGuestIdentityToken(identity)).toBe('guest-1')
    })
  })

  describe('with GUEST_JWT_SECRET', () => {
    beforeEach(() => {
      process.env.GUEST_JWT_SECRET = DEDICATED
    })

    it('signs every new token with the dedicated secret, never with NEXTAUTH_SECRET', () => {
      jest.useFakeTimers({ now: DURING })

      for (const token of [createGuestToken('guest-1', 'Ann'), createGuestIdentityToken('guest-1')]) {
        expect(() => jwt.verify(token, DEDICATED)).not.toThrow()
        expect(() => jwt.verify(token, NEXTAUTH)).toThrow('invalid signature')
      }
    })

    it('still accepts tokens signed with NEXTAUTH_SECRET before the switch, during the transition', () => {
      jest.useFakeTimers({ now: DURING })
      const session = mintBeforeTheSwitch(() => createGuestToken('guest-old', 'Old Guest'))
      const identity = mintBeforeTheSwitch(() => createGuestIdentityToken('guest-old'))

      expect(verifyGuestToken(session)).toMatchObject({ guestId: 'guest-old', guestName: 'Old Guest' })
      expect(verifyGuestIdentityToken(identity)).toBe('guest-old')
    })

    it('accepts them up to the last second before the cutoff', () => {
      jest.useFakeTimers({ now: new Date('2026-09-28T00:00:00.000Z') })
      const identity = mintBeforeTheSwitch(() => createGuestIdentityToken('guest-old'))

      jest.setSystemTime(LAST_SECOND)
      expect(verifyGuestIdentityToken(identity)).toBe('guest-old')
    })

    it('refuses them from the cutoff on, even when the token itself has not expired', () => {
      // Signed an hour before the cutoff, so a 12h session token is still in date after it:
      // the refusal below is the cutoff's doing, not expiry's.
      jest.useFakeTimers({ now: new Date('2026-12-26T23:00:00.000Z') })
      const session = mintBeforeTheSwitch(() => createGuestToken('guest-old', 'Old Guest'))
      const identity = mintBeforeTheSwitch(() => createGuestIdentityToken('guest-old'))
      expect(verifyGuestToken(session)).not.toBeNull()

      jest.setSystemTime(CUTOFF)
      expect(verifyGuestToken(session)).toBeNull()
      expect(verifyGuestIdentityToken(identity)).toBeNull()
      expect(() => jwt.verify(session, NEXTAUTH)).not.toThrow()
    })

    it('keeps verifying its own tokens after the cutoff', () => {
      jest.useFakeTimers({ now: CUTOFF })
      const session = createGuestToken('guest-new', 'New Guest')

      jest.setSystemTime(new Date('2026-12-27T06:00:00.000Z'))
      expect(verifyGuestToken(session)).toMatchObject({ guestId: 'guest-new' })
    })

    it('never accepts a token signed with a secret that is neither', () => {
      jest.useFakeTimers({ now: DURING })
      const forged = jwt.sign({ type: 'guest', guestName: 'Mallory', version: 1 }, 'some-other-secret', {
        subject: 'guest-forged',
        issuer: 'boardly-guest',
        expiresIn: '12h',
      })

      expect(verifyGuestToken(forged)).toBeNull()
    })

    it('keeps the two token types apart under the old secret too', () => {
      jest.useFakeTimers({ now: DURING })
      const session = mintBeforeTheSwitch(() => createGuestToken('guest-old', 'Old Guest'))
      const identity = mintBeforeTheSwitch(() => createGuestIdentityToken('guest-old'))

      expect(verifyGuestIdentityToken(session)).toBeNull()
      expect(verifyGuestToken(identity)).toBeNull()
    })

    it('refuses an expired old-secret token during the transition', () => {
      jest.useFakeTimers({ now: DURING })
      const session = mintBeforeTheSwitch(() => createGuestToken('guest-old', 'Old Guest'))

      jest.setSystemTime(new Date(DURING.getTime() + 13 * 60 * 60 * 1000))
      expect(verifyGuestToken(session)).toBeNull()
    })
  })
})
