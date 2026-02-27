import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { getSecurityHeaders } from '@/lib/csrf'
import { getServerSocketUrl } from '@/lib/socket-url'

const IS_DEVELOPMENT = process.env.NODE_ENV === 'development'
const SOCKET_URL = getServerSocketUrl()
const SECURITY_HEADERS = getSecurityHeaders()
const ALLOWED_ORIGINS_FROM_ENV = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  : []
const ALLOWED_CORS_ORIGINS = process.env.CORS_ORIGIN?.split(',') || [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://boardly.online'
]

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

  return `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com;
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

const CSP_HEADER_VALUE = buildCspHeaderValue()

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

  response.headers.set('Content-Security-Policy', CSP_HEADER_VALUE)

  // Add CORS headers for API routes
  if (pathname.startsWith('/api')) {
    const origin = request.headers.get('origin')
    
    // In development, allow localhost and local hostname
    if (IS_DEVELOPMENT || (origin && ALLOWED_CORS_ORIGINS.some(allowed => origin.includes(allowed.trim())))) {
      response.headers.set('Access-Control-Allow-Origin', origin || '*')
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    }

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 200, headers: response.headers })
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
