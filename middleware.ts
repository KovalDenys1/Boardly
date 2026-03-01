import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSecurityHeaders, verifyCsrfToken } from '@/lib/csrf'
import { getServerSocketUrl } from '@/lib/socket-url'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
const SOCKET_URL = getServerSocketUrl()
const SECURITY_HEADERS = getSecurityHeaders()
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
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
const AUTH_SESSION_COOKIE_NAMES = [
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
  'authjs.session-token',
  '__Secure-authjs.session-token',
]

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

function hasAuthenticatedSessionCookie(request: NextRequest): boolean {
  return AUTH_SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))
}

function buildCspHeaderValue() {
  const connectSrcCandidates = new Set<string>([
    "'self'",
    SOCKET_URL,
    'wss://*.onrender.com',
    'ws://localhost:*',
    'ws://127.0.0.1:*',
    'http://localhost:*',
    'http://127.0.0.1:*',
    'https://vercel.live',
    'https://*.ingest.sentry.io',
    'https://*.ingest.de.sentry.io',
  ])

  const addSocketVariant = (origin: string) => {
    try {
      const parsed = new URL(origin)
      connectSrcCandidates.add(parsed.origin)
      if (parsed.protocol === 'http:') {
        connectSrcCandidates.add(`ws://${parsed.host}`)
      } else if (parsed.protocol === 'https:') {
        connectSrcCandidates.add(`wss://${parsed.host}`)
      }
    } catch {
      // Ignore invalid origin values
    }
  }

  addSocketVariant(SOCKET_URL)
  for (const origin of ALLOWED_ORIGINS_FROM_ENV) {
    addSocketVariant(origin)
  }

  const connectSrcValue = Array.from(connectSrcCandidates).join(' ')
  // Next.js 15 app-router output includes inline bootstrap scripts without nonce
  // across statically rendered routes. Keep production CSP compatible with that
  // output to avoid blocking core Next.js chunk/bootstrap execution.
  const scriptSrcValue = IS_DEVELOPMENT
    ? "'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com"
    : "'self' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com"

  return `
    default-src 'self';
    script-src ${scriptSrcValue};
    style-src 'self' 'unsafe-inline' https://accounts.google.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data:;
    connect-src ${connectSrcValue};
    worker-src 'self' blob:;
    frame-src 'self' https://accounts.google.com https://vercel.live;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${IS_DEVELOPMENT ? '' : 'upgrade-insecure-requests;'}
  `.replace(/\s{2,}/g, ' ').trim()
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const { pathname } = request.nextUrl

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

  // Add CORS headers for API routes
  if (pathname.startsWith('/api')) {
    const origin = request.headers.get('origin')
    const allowedOrigin = resolveAllowedCorsOrigin(origin)

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
    if (isUnsafeMethod && hasAuthenticatedSessionCookie(request) && !verifyCsrfToken(request)) {
      return NextResponse.json(
        { error: 'Invalid origin. Possible CSRF attack.' },
        { status: 403 }
      )
    }
  }

  return response
}

// Configure which routes the middleware should run on
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
