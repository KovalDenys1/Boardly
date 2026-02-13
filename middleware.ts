import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSecurityHeaders } from '@/lib/csrf'
import { getServerSocketUrl } from '@/lib/socket-url'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Add security headers to all responses
  const securityHeaders = getSecurityHeaders()
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // Add CSP (Content Security Policy) header
  const isDevelopment = process.env.NODE_ENV === 'development'
  const socketUrl = getServerSocketUrl()
  const allowedOriginsFromEnv = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
    : []

  const connectSrcCandidates = new Set<string>([
    "'self'",
    socketUrl,
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

  addSocketVariant(socketUrl)
  for (const origin of allowedOriginsFromEnv) {
    addSocketVariant(origin)
  }
  const connectSrcValue = Array.from(connectSrcCandidates).join(' ')
  
  const cspHeader = `
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
    ${isDevelopment ? '' : 'upgrade-insecure-requests;'}
  `.replace(/\s{2,}/g, ' ').trim()

  response.headers.set('Content-Security-Policy', cspHeader)

  // Add CORS headers for API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin')
    const isDevelopment = process.env.NODE_ENV === 'development'
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'https://boardly.online'
    ]
    
    // In development, allow localhost and local hostname
    if (isDevelopment || (origin && allowedOrigins.some(allowed => origin.includes(allowed.trim())))) {
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
