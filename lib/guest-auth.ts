import { randomUUID } from 'crypto'
import jwt, { SignOptions } from 'jsonwebtoken'
import { RETENTION_DAYS } from './retention-periods'
import { legacyNextAuthSecret } from './nextauth-secret-transition'

const GUEST_TOKEN_ISSUER = 'boardly-guest'
const DEFAULT_GUEST_TOKEN_TTL = '12h'

/**
 * Long-lived proof of *who* a guest is, separate from the short-lived token
 * that authorises their requests.
 *
 * The session token lasts 12h, and once it expired the guest session route had
 * nothing to recognise the person by and minted a brand new guest — so a guest
 * who came back the next day was a different user and cross-day retention could
 * not be measured at all (#818). This token carries identity only: it is signed
 * with a distinct type, so presenting it where a session token is expected
 * fails, and it can never be used to authorise a request on its own.
 *
 * It is still a bearer credential, which is why it is signed rather than being
 * a bare guest id — a plain id in localStorage would let anyone who learned one
 * take over that guest.
 *
 * Its lifetime is the guest retention, not longer: a guest who has played is
 * deleted after 90 idle days (scripts/cleanup-old-guests.ts,
 * PLAYED_GUEST_CLEANUP_DAYS), and the token is re-issued on every visit, so
 * both clocks run from the same last visit. At 180 days the device kept a
 * credential for a row that no longer existed (#1155, ekomloven § 3-15).
 */
export const GUEST_IDENTITY_TTL_DAYS = RETENTION_DAYS.guestIdentityToken
const DEFAULT_GUEST_IDENTITY_TTL = `${GUEST_IDENTITY_TTL_DAYS}d`

interface GuestJwtPayload extends jwt.JwtPayload {
  type?: string
  guestName?: string
  version?: number
}

export interface GuestTokenClaims {
  guestId: string
  guestName: string
  expiresAt?: number
}

/** The secret every new guest token is signed with. */
function getGuestJwtSecret(): string {
  const secret = process.env.GUEST_JWT_SECRET || process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error('Missing guest JWT secret')
  }

  return secret
}

/**
 * Verifies against the signing secret, then - until NEXTAUTH_SECRET_FALLBACK_CUTOFF, and only
 * when GUEST_JWT_SECRET is set to something else - against NEXTAUTH_SECRET, which signed every
 * guest token before GUEST_JWT_SECRET existed in production (#1142, #1149). Without the second
 * try, setting GUEST_JWT_SECRET would turn every returning guest into a new one. From the
 * cutoff on only the signing secret verifies. Returns null for anything that fails both.
 */
function verifyGuestJwt(token: string): GuestJwtPayload | null {
  const options: jwt.VerifyOptions = { issuer: GUEST_TOKEN_ISSUER }
  try {
    return jwt.verify(token, getGuestJwtSecret(), options) as GuestJwtPayload
  } catch {
    const legacySecret = legacyNextAuthSecret('GUEST_JWT_SECRET')
    if (!legacySecret) return null
    try {
      return jwt.verify(token, legacySecret, options) as GuestJwtPayload
    } catch {
      return null
    }
  }
}

export function createGuestId(): string {
  return `guest-${randomUUID()}`
}

export function createGuestToken(guestId: string, guestName: string): string {
  const expiresIn = (process.env.GUEST_JWT_EXPIRES_IN || DEFAULT_GUEST_TOKEN_TTL) as SignOptions['expiresIn']

  return jwt.sign(
    {
      type: 'guest',
      guestName,
      version: 1,
    },
    getGuestJwtSecret(),
    {
      subject: guestId,
      issuer: GUEST_TOKEN_ISSUER,
      expiresIn,
    }
  )
}

export function createGuestIdentityToken(guestId: string): string {
  const expiresIn = (process.env.GUEST_IDENTITY_EXPIRES_IN ||
    DEFAULT_GUEST_IDENTITY_TTL) as SignOptions['expiresIn']

  return jwt.sign(
    { type: 'guest-identity', version: 1 },
    getGuestJwtSecret(),
    { subject: guestId, issuer: GUEST_TOKEN_ISSUER, expiresIn }
  )
}

/** Resolves the guest this identity token belongs to, or null. */
export function verifyGuestIdentityToken(token: string): string | null {
  const decoded = verifyGuestJwt(token)
  if (!decoded) return null

  // A session token must not be accepted here and vice versa.
  if (decoded.type !== 'guest-identity') return null

  return typeof decoded.sub === 'string' ? decoded.sub : null
}

export function verifyGuestToken(token: string): GuestTokenClaims | null {
  const decoded = verifyGuestJwt(token)
  if (!decoded) return null

  if (decoded.type !== 'guest') return null

  const guestId = typeof decoded.sub === 'string' ? decoded.sub : null
  const guestName = typeof decoded.guestName === 'string' ? decoded.guestName : null

  if (!guestId || !guestName) {
    return null
  }

  return {
    guestId,
    guestName,
    expiresAt: typeof decoded.exp === 'number' ? decoded.exp * 1000 : undefined,
  }
}

function getBearerToken(authorization: string | null): string | null {
  if (!authorization) return null

  const [scheme, token] = authorization.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null
  }

  return token
}

export function getGuestTokenFromRequest(request: Request): string | null {
  const headerToken = request.headers.get('X-Guest-Token')?.trim()
  if (headerToken) return headerToken

  return getBearerToken(request.headers.get('Authorization'))
}

export function getGuestClaimsFromRequest(request: Request): GuestTokenClaims | null {
  const token = getGuestTokenFromRequest(request)
  if (!token) return null
  return verifyGuestToken(token)
}
