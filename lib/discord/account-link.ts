import { createHmac, hkdfSync, randomBytes } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { AdapterAccount } from 'next-auth/adapters'
import { CustomPrismaAdapter } from '@/lib/custom-prisma-adapter'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { constantTimeEqual } from '@/lib/secret-compare'
import { AccountSuspendedError, getOptionalSessionUser } from '@/lib/session-user'
import { claimOnce } from '@/lib/webhook-dedupe'
import {
  DISCORD_API_BASE,
  DISCORD_ROLE_CONNECTION_SCOPE,
  DISCORD_TOKEN_URL,
  getDiscordConfig,
} from '@/lib/discord/role-connection'

/**
 * Linking a Discord account to the signed-in Boardly account for Linked Roles (#1218).
 *
 * /discord/link used to call `signIn('discord')` and let next-auth's OAuth callback do the
 * linking. That callback picks the account from whatever session cookie arrives with it
 * (next-auth 4.24 core/lib/callback-handler.js): present, it links to that user and issues a
 * fresh session; missing, expired or cut off (#1136), it creates a brand-new user for a
 * Discord address it has not seen and signs the browser into that. Either way the session was
 * replaced, and a new one carries a fresh `authenticatedAt`, which PATCH /api/user/profile
 * reads as a recent sign-in.
 *
 * So the link no longer goes through next-auth at all:
 * - POST /api/discord/link requires the session, signed in within the last ten minutes
 *   (isRecentSignIn, lib/auth-session-policy.ts), and answers with Discord's authorize URL. Its
 *   `state` is `bdlink.<nonce>`, and an httpOnly cookie carries the same nonce, the session's
 *   user id and an expiry, HMAC-signed with a key derived from NEXTAUTH_SECRET.
 * - Discord sends the browser back to the redirect URI already registered for sign-in,
 *   /api/auth/callback/discord, so nothing changes in the Discord developer portal. The
 *   catch-all route hands a request whose state carries the prefix to
 *   `handleDiscordLinkCallback` and every other one to next-auth. next-auth's own state is a
 *   base64url string with no `.` in it, so the two cannot be confused.
 * - The callback links only when the cookie verifies, its nonce equals the returned state, it
 *   has not expired, it was issued to the user the session belongs to right now, and the nonce
 *   has not been claimed before. It then calls the adapter's `linkAccount` for that user id.
 *   It never writes a session cookie, so the browser leaves signed in exactly as it arrived.
 */

const log = apiLogger('discord/account-link')

export const DISCORD_LINK_STATE_PREFIX = 'bdlink.'
export const DISCORD_LINK_COOKIE = 'boardly.discord-link'
export const DISCORD_LINK_CALLBACK_PATH = '/api/auth/callback/discord'
export const DISCORD_LINK_PAGE = '/discord/link'
// Discord's authorize page is one click; ten minutes covers a slow sign-in to Discord first.
export const DISCORD_LINK_TTL_SECONDS = 10 * 60
// `identify` for the Discord user id the row is keyed on, the role scope for Linked Roles.
// No `email`: the link does not read the Discord address, so it does not ask for it.
export const DISCORD_LINK_SCOPE = `identify ${DISCORD_ROLE_CONNECTION_SCOPE}`

// Each call to Discord gets this long. The callback holds a browser on a blank redirect while
// it waits, and a hung Discord must end as a failed link the person can retry, not as a
// function timeout.
export const DISCORD_FETCH_TIMEOUT_MS = 5_000

const DISCORD_AUTHORIZE_URL = 'https://discord.com/oauth2/authorize'
const NONCE_BYTES = 32
const HKDF_SALT = 'boardly-discord-link'
const HKDF_INFO = 'state-cookie-v1'

/** What the page shows after a callback that did not link, read from `?linkError=`. */
export type DiscordLinkError = 'denied' | 'expired' | 'taken' | 'otherDiscord' | 'failed'

type LinkCookiePayload = { n: string; u: string; e: number }

function readSecret(): string | null {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  return secret && secret.length > 0 ? secret : null
}

function signingKey(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, HKDF_INFO, 32))
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', signingKey(secret)).update(payload).digest('base64url')
}

/**
 * The redirect URI next-auth registers for Discord sign-in, computed the way next-auth does
 * (utils/detect-origin.js + utils/parse-url.js): NEXTAUTH_URL when set, otherwise the
 * forwarded host on Vercel. The authorize request and the token exchange must send the same
 * string, and Discord accepts only a URI registered for the application.
 */
export function discordLinkRedirectUri(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  let origin = process.env.NEXTAUTH_URL
  if (!origin && (process.env.VERCEL || process.env.AUTH_TRUST_HOST) && forwardedHost) {
    origin = `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`
  }
  let raw = origin || 'http://localhost:3000/api/auth'
  if (!raw.startsWith('http')) raw = `https://${raw}`
  const url = new URL(raw)
  const path = (url.pathname === '/' ? '/api/auth' : url.pathname).replace(/\/$/, '')
  return `${url.origin}${path}/callback/discord`
}

export function isDiscordLinkState(state: string | null | undefined): state is string {
  return typeof state === 'string' && state.startsWith(DISCORD_LINK_STATE_PREFIX)
}

function cookieOptions(redirectUri: string, maxAge: number) {
  return {
    httpOnly: true,
    // Lax, not Strict: Discord sends the browser back with a cross-site top-level GET, and a
    // Strict cookie would not come with it.
    sameSite: 'lax' as const,
    secure: redirectUri.startsWith('https://'),
    path: DISCORD_LINK_CALLBACK_PATH,
    maxAge,
  }
}

/** The start of a link for `userId`: the URL to send the browser to and the cookie to set. */
export function createDiscordLinkStart(params: {
  userId: string
  redirectUri: string
  clientId: string
  now?: number
}): { authorizeUrl: string; cookieValue: string; state: string } {
  const secret = readSecret()
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set; cannot sign the Discord link state')
  }
  const nonce = randomBytes(NONCE_BYTES).toString('base64url')
  const payload: LinkCookiePayload = {
    n: nonce,
    u: params.userId,
    e: Math.floor((params.now ?? Date.now()) / 1000) + DISCORD_LINK_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const cookieValue = `${body}.${sign(body, secret)}`
  const state = `${DISCORD_LINK_STATE_PREFIX}${nonce}`

  const url = new URL(DISCORD_AUTHORIZE_URL)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', DISCORD_LINK_SCOPE)
  url.searchParams.set('state', state)

  return { authorizeUrl: url.toString(), cookieValue, state }
}

/**
 * The cookie's payload when its signature verifies and it has not expired, else null.
 * Exported for the tests; the callback is the only caller.
 */
export function readDiscordLinkCookie(
  cookieValue: string | undefined,
  now: number = Date.now()
): LinkCookiePayload | null {
  const secret = readSecret()
  if (!secret || !cookieValue) return null
  const dot = cookieValue.indexOf('.')
  if (dot <= 0) return null
  const body = cookieValue.slice(0, dot)
  const signature = cookieValue.slice(dot + 1)
  if (!constantTimeEqual(signature, sign(body, secret))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<LinkCookiePayload>
    if (typeof payload.n !== 'string' || typeof payload.u !== 'string' || typeof payload.e !== 'number') {
      return null
    }
    if (payload.e * 1000 < now) return null
    return { n: payload.n, u: payload.u, e: payload.e }
  } catch {
    return null
  }
}

export function setDiscordLinkCookie(response: NextResponse, cookieValue: string, redirectUri: string): void {
  response.cookies.set(DISCORD_LINK_COOKIE, cookieValue, cookieOptions(redirectUri, DISCORD_LINK_TTL_SECONDS))
}

type DiscordTokens = {
  access_token: string
  refresh_token: string | null
  expires_at: number
  token_type: string | null
  scope: string | null
}

async function exchangeCode(code: string, redirectUri: string): Promise<DiscordTokens> {
  const config = getDiscordConfig()
  if (!config) throw new Error('Discord OAuth is not configured')
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
    // Covers reading the body too; an abort rejects, and the callback answers linkError=failed.
    signal: AbortSignal.timeout(DISCORD_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Discord code exchange failed with ${response.status}`)
  }
  const payload = (await response.json()) as Record<string, unknown>
  if (typeof payload.access_token !== 'string' || payload.access_token.length === 0) {
    throw new Error('Discord code exchange returned no access token')
  }
  const expiresIn = typeof payload.expires_in === 'number' ? payload.expires_in : 7 * 24 * 60 * 60
  return {
    access_token: payload.access_token,
    refresh_token: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: typeof payload.token_type === 'string' ? payload.token_type : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
  }
}

async function fetchDiscordUserId(accessToken: string): Promise<string> {
  const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(DISCORD_FETCH_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Discord /users/@me failed with ${response.status}`)
  }
  const payload = (await response.json()) as { id?: unknown }
  if (typeof payload.id !== 'string' || payload.id.length === 0) {
    throw new Error('Discord /users/@me returned no id')
  }
  return payload.id
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

/**
 * Puts the Discord account on `userId` and on nothing else. A Discord account that already
 * belongs to another Boardly account stays there, and a Boardly account that already has a
 * different Discord account keeps that one: both are refused rather than moved, because the
 * Discord row is also a way to sign in.
 */
export async function linkDiscordAccountToUser(
  userId: string,
  providerAccountId: string,
  tokens: DiscordTokens
): Promise<'linked' | 'taken' | 'otherDiscord'> {
  const existing = await prisma.accounts.findUnique({
    where: { provider_providerAccountId: { provider: 'discord', providerAccountId } },
    select: { id: true, userId: true },
  })
  if (existing) {
    if (existing.userId !== userId) return 'taken'
    // Re-linking the same Discord account (legacy scope, revoked grant): fresh tokens only,
    // and only the ones Discord returned, as lib/next-auth.ts's signIn refresh does.
    await prisma.accounts.update({
      where: { id: existing.id },
      data: {
        access_token: tokens.access_token,
        expires_at: tokens.expires_at,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        ...(tokens.token_type ? { token_type: tokens.token_type } : {}),
      },
    })
    return 'linked'
  }

  const otherDiscord = await prisma.accounts.findFirst({
    where: { userId, provider: 'discord' },
    select: { id: true },
  })
  if (otherDiscord) return 'otherDiscord'

  const account: AdapterAccount = {
    userId,
    type: 'oauth',
    provider: 'discord',
    providerAccountId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    expires_at: tokens.expires_at,
    token_type: (tokens.token_type ?? undefined) as AdapterAccount['token_type'],
    scope: tokens.scope ?? undefined,
  }
  try {
    await CustomPrismaAdapter(prisma).linkAccount!(account)
  } catch (error) {
    // Another request linked the same Discord account between the read and the write.
    if (isUniqueConflict(error)) return 'taken'
    throw error
  }
  return 'linked'
}

function finish(request: NextRequest, redirectUri: string, target: { linked: true } | { error: DiscordLinkError }) {
  const url = new URL(DISCORD_LINK_PAGE, request.url)
  if ('linked' in target) url.searchParams.set('linked', '1')
  else url.searchParams.set('linkError', target.error)
  const response = NextResponse.redirect(url)
  // Whatever happened, the attempt is over: the cookie goes with the first answer.
  response.cookies.set(DISCORD_LINK_COOKIE, '', cookieOptions(redirectUri, 0))
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/**
 * GET /api/auth/callback/discord with a `bdlink.` state. Never touches the session cookie:
 * every exit is a redirect to /discord/link that only clears the link cookie.
 */
export async function handleDiscordLinkCallback(request: NextRequest): Promise<NextResponse> {
  const redirectUri = discordLinkRedirectUri(request)
  const params = request.nextUrl.searchParams
  const state = params.get('state') ?? ''
  const nonce = state.slice(DISCORD_LINK_STATE_PREFIX.length)

  const cookie = readDiscordLinkCookie(request.cookies.get(DISCORD_LINK_COOKIE)?.value)
  if (!cookie || nonce.length === 0 || !constantTimeEqual(cookie.n, nonce)) {
    log.warn('Discord link callback refused: state cookie missing, expired, forged or for another attempt')
    return finish(request, redirectUri, { error: 'expired' })
  }

  // The session as it is now, with the suspended flag read from the database (a write).
  let sessionUserId: string | null
  try {
    sessionUserId = (await getOptionalSessionUser({ method: 'POST' }))?.user.id ?? null
  } catch (error) {
    if (error instanceof AccountSuspendedError) {
      const response = NextResponse.redirect(new URL('/suspended', request.url))
      response.cookies.set(DISCORD_LINK_COOKIE, '', cookieOptions(redirectUri, 0))
      return response
    }
    sessionUserId = null
  }
  if (!sessionUserId || sessionUserId !== cookie.u) {
    // Signed out since the start, or signed in as someone else: link nothing, create nothing.
    log.warn('Discord link callback refused: the session is not the one the link was started for', {
      hasSession: Boolean(sessionUserId),
    })
    return finish(request, redirectUri, { error: 'expired' })
  }

  // Single use. The cookie is cleared by the first answer and Discord's code is single use
  // too; the claim closes the window for a replay that carries a copy of both. Without Redis
  // it degrades open, like every other Redis-backed check here.
  const claim = await claimOnce(`discord-link:${nonce}`, DISCORD_LINK_TTL_SECONDS + 60, 'discord/account-link')
  if (claim === 'duplicate') {
    log.warn('Discord link callback refused: state already used', { userId: sessionUserId })
    return finish(request, redirectUri, { error: 'expired' })
  }

  if (params.get('error')) {
    // The person pressed Cancel on Discord's page.
    return finish(request, redirectUri, { error: 'denied' })
  }
  const code = params.get('code')
  if (!code) {
    return finish(request, redirectUri, { error: 'failed' })
  }

  try {
    const tokens = await exchangeCode(code, redirectUri)
    const discordUserId = await fetchDiscordUserId(tokens.access_token)
    const result = await linkDiscordAccountToUser(sessionUserId, discordUserId, tokens)
    if (result !== 'linked') {
      log.warn('Discord link refused', { userId: sessionUserId, reason: result })
      return finish(request, redirectUri, { error: result })
    }
    log.info('Discord account linked to the signed-in user', { userId: sessionUserId })
    return finish(request, redirectUri, { linked: true })
  } catch (error) {
    log.error('Discord link failed', error instanceof Error ? error : new Error(String(error)), {
      userId: sessionUserId,
    })
    return finish(request, redirectUri, { error: 'failed' })
  }
}
