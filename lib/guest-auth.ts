import { randomUUID } from 'crypto'
import jwt, { SignOptions } from 'jsonwebtoken'

const GUEST_TOKEN_ISSUER = 'boardly-guest'
const DEFAULT_GUEST_TOKEN_TTL = '12h'

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

function getGuestJwtSecret(): string {
  const secret = process.env.GUEST_JWT_SECRET || process.env.NEXTAUTH_SECRET

  if (!secret) {
    throw new Error('Missing guest JWT secret')
  }

  return secret
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

export function verifyGuestToken(token: string): GuestTokenClaims | null {
  try {
    const decoded = jwt.verify(token, getGuestJwtSecret(), {
      issuer: GUEST_TOKEN_ISSUER,
    }) as GuestJwtPayload

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
  } catch {
    return null
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
