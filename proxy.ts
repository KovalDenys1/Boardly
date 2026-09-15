import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSecurityHeaders, isSignatureAuthenticatedWebhook, verifyCsrfToken } from '@/lib/csrf'
import {
  authorizeDiscordInternalRequest,
  hasValidDiscordInternalSecret,
} from '@/lib/discord/internal-auth'
import {
  SIGNUP_SOURCE_COOKIE,
  SIGNUP_SOURCE_COOKIE_MAX_AGE_SECONDS,
  deriveSignupSource,
} from '@/lib/signup-source'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
const SECURITY_HEADERS = getSecurityHeaders()
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://boardly.online',
]
const ALLOWED_ORIGINS_FROM_ENV = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  : []
const RAW_ALLOWED_CORS_ORIGINS = ALLOWED_ORIGINS_FROM_ENV.length > 0
  ? ALLOWED_ORIGINS_FROM_ENV
  : DEFAULT_CORS_ORIGINS

function normalizeCorsOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null

  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

const ALLOWED_CORS_ORIGIN_SET = new Set(
  RAW_ALLOWED_CORS_ORIGINS
    .map((origin) => normalizeCorsOrigin(origin))
    .filter((origin): origin is string => origin !== null)
)
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function resolveAllowedCorsOrigin(origin: string | null): string | null {
  const normalizedOrigin = normalizeCorsOrigin(origin)
  if (!normalizedOrigin) return null

  if (ALLOWED_CORS_ORIGIN_SET.has(normalizedOrigin)) {
    return normalizedOrigin
  }

  if (IS_DEVELOPMENT && isLocalDevelopmentOrigin(normalizedOrigin)) {
    return normalizedOrigin
  }

  return null
}

function hasValidInternalSecret(request: NextRequest): boolean {
  const configuredSecret = process.env.BOARDLY_INTERNAL_SECRET
  if (!configuredSecret) return false
  return request.headers.get('X-Internal-Secret') === configuredSecret
}

function hasValidCronAuthorization(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

// The Discord bot's routes. Its secret opens these and nothing else, so a Pi env file
// that leaks cannot reach the crons or the bot-turn trigger.
const DISCORD_INTERNAL_PATH_PREFIX = '/api/internal/discord/'

function isDiscordInternalPath(pathname: string): boolean {
  return pathname.startsWith(DISCORD_INTERNAL_PATH_PREFIX)
}

function isTrustedServerRequest(request: NextRequest): boolean {
  if (hasValidInternalSecret(request) || hasValidCronAuthorization(request)) return true
  return isDiscordInternalPath(request.nextUrl.pathname) && hasValidDiscordInternalSecret(request)
}

function buildCspHeaderValue() {
  const connectSrcCandidates = new Set<string>([
    "'self'",
    'ws://localhost:*',
    'ws://127.0.0.1:*',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://vercel.live',
    'https://*.ingest.sentry.io',
    'https://*.ingest.de.sentry.io',
    // AdSense and the Google consent message (#876) talk back to these.
    'https://pagead2.googlesyndication.com',
    'https://fundingchoicesmessages.google.com',
    'https://csi.gstatic.com',
  ])

  const connectSrcValue = Array.from(connectSrcCandidates).join(' ')
  // Next.js 15 app-router output includes inline bootstrap scripts without nonce
  // across statically rendered routes. Keep production CSP compatible with that
  // output to avoid blocking core Next.js chunk/bootstrap execution.
  // The AdSense loader, the ad-serving hosts it pulls in, and the Google
  // consent message (#784 put the tag in the HTML; #876 found that the policy
  // had never let it run).
  const adsScriptHosts =
    'https://pagead2.googlesyndication.com https://fundingchoicesmessages.google.com https://tpc.googlesyndication.com https://googleads.g.doubleclick.net https://www.googletagservices.com'
  const scriptSrcValue = IS_DEVELOPMENT
    ? `'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com ${adsScriptHosts}`
    : `'self' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com ${adsScriptHosts}`

  return `
    default-src 'self';
    script-src ${scriptSrcValue};
    style-src 'self' 'unsafe-inline' https://accounts.google.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data:;
    connect-src ${connectSrcValue};
    worker-src 'self' blob:;
    frame-src 'self' https://accounts.google.com https://vercel.live https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${IS_DEVELOPMENT ? '' : 'upgrade-insecure-requests;'}
  `.replace(/\s{2,}/g, ' ').trim()
}

/**
 * Records where a visitor came from, on the request that brought them here.
 *
 * `captureSignupSource` in GuestContext does the same thing, but from a `useEffect`, so it
 * runs after the page has mounted - and a guest can be minted by an API call from that same
 * first load. Eight of the twenty-nine guests created between 09.09 and 13.09 were stored
 * with no source at all, which is the race losing.
 *
 * Here the real Referer and the real query string are on the request itself, before any
 * script runs, so this is a measurement rather than a guess. First touch still wins: an
 * existing cookie is never overwritten, and the client capture stays as the fallback for
 * anything the matcher skips.
 */
function captureSignupSourceOnRequest(request: NextRequest, response: NextResponse): void {
  const { pathname, searchParams } = request.nextUrl

  // Only on a document request. On an API call or an asset the Referer is one of our own
  // pages, which would record "direct" for someone who actually arrived from a search.
  const isDocument = request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')
  if (!isDocument || pathname.startsWith('/api/')) return

  if (request.cookies.get(SIGNUP_SOURCE_COOKIE)?.value) return

  const value = deriveSignupSource({
    utmSource: searchParams.get('utm_source'),
    utmMedium: searchParams.get('utm_medium'),
    utmCampaign: searchParams.get('utm_campaign'),
    referrer: request.headers.get('referer'),
    currentHostname: request.nextUrl.hostname,
  })

  response.cookies.set(SIGNUP_SOURCE_COOKIE, value, {
    maxAge: SIGNUP_SOURCE_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: request.nextUrl.protocol === 'https:',
  })
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

  captureSignupSourceOnRequest(request, response)

  const SUSPENDED_EXEMPT = ['/suspended', '/auth/', '/api/', '/_next/', '/favicon']
  const isSuspendedExempt = SUSPENDED_EXEMPT.some((p) => pathname.startsWith(p))
  if (!isSuspendedExempt) {
    const suspendedToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (suspendedToken?.suspended) {
      return NextResponse.redirect(new URL('/suspended', request.url))
    }
  }

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (request.method === 'OPTIONS' && pathname.startsWith('/api/admin')) {
      // Let CORS preflight pass; auth is enforced on actual request methods.
    } else {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
      const isAdmin = token?.role === 'admin' && !token?.suspended

      if (!isAdmin) {
        if (pathname.startsWith('/api/admin')) {
          const status = token ? 403 : 401
          return NextResponse.json(
            { error: token ? 'Admin access required' : 'Authentication required' },
            { status }
          )
        }

        if (!token) {
          const loginUrl = new URL('/auth/login', request.url)
          loginUrl.searchParams.set('returnUrl', pathname)
          return NextResponse.redirect(loginUrl)
        }

        return NextResponse.redirect(new URL('/games', request.url))
      }
    }
  }

  // Add security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  response.headers.set('Content-Security-Policy', buildCspHeaderValue())

  // Add CORS headers for API routes.
  // When no Origin header is present (same-origin requests), Safari still performs
  // access-control checks in certain conditions. Fall back to the server's own origin
  // so CORS headers are always present on API responses.
  if (pathname.startsWith('/api')) {
    // Gate the bot's routes here as well as in the handlers: a wrong or missing secret
    // never reaches a function, and the heartbeat POST (no Origin header, so no CSRF
    // token) is let through below only because the same secret marks it trusted.
    if (isDiscordInternalPath(pathname) && request.method !== 'OPTIONS') {
      const authError = authorizeDiscordInternalRequest(request)
      if (authError) return authError
    }

    const origin = request.headers.get('origin')
    const allowedOrigin =
      resolveAllowedCorsOrigin(origin) ??
      (origin === null ? resolveAllowedCorsOrigin(request.nextUrl.origin) : null)

    if (allowedOrigin) {
      response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Guest-Token')
      response.headers.set('Access-Control-Allow-Credentials', 'true')
      response.headers.set('Vary', 'Origin')
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: response.headers })
    }

    const isUnsafeMethod = !SAFE_METHODS.has(request.method.toUpperCase())
    if (
      isUnsafeMethod &&
      !isSignatureAuthenticatedWebhook(pathname) &&
      !isTrustedServerRequest(request) &&
      !verifyCsrfToken(request)
    ) {
      return NextResponse.json(
        { error: 'Invalid origin. Possible CSRF attack.' },
        { status: 403 }
      )
    }
  }

  return response
}

// Configure which routes the proxy should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
