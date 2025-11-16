import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSecurityHeaders } from '@/lib/csrf'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Add security headers to all responses
  const securityHeaders = getSecurityHeaders()
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  // Add CSP (Content Security Policy) header
  const isDevelopment = process.env.NODE_ENV === 'development'
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'
  
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live https://accounts.google.com https://apis.google.com;
    style-src 'self' 'unsafe-inline' https://accounts.google.com;
    img-src 'self' data: https: blob:;
    font-src 'self' data:;
    connect-src 'self' ${socketUrl} https://*.supabase.co wss://* ws://localhost:* http://localhost:* https://vercel.live ${isDevelopment ? 'http://Denys:*' : ''};
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
      'http://Denys:3001',
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
