import { NextRequest } from 'next/server'
import { logger } from './logger'

/**
 * CSRF Protection utility for Next.js API routes
 * 
 * Verifies that requests come from the same origin to prevent CSRF attacks.
 * This is a simple implementation - for production, consider using a library
 * like 'csrf' or implementing token-based CSRF protection.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  process.env.NEXTAUTH_URL || 'http://localhost:3000',
  process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://boardly.online',
]

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

function resolveAllowedOrigins(request: NextRequest): string[] {
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim())
    : DEFAULT_ALLOWED_ORIGINS

  const normalized = configuredOrigins
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => origin !== null)

  normalized.push(request.nextUrl.origin)
  return Array.from(new Set(normalized))
}

function extractRequestOrigin(request: NextRequest): string | null {
  const originHeader = request.headers.get('origin')
  const normalizedOriginHeader = normalizeOrigin(originHeader)
  if (normalizedOriginHeader) return normalizedOriginHeader

  const referer = request.headers.get('referer')
  return normalizeOrigin(referer)
}

function isOriginAllowed(requestOrigin: string, allowedOrigin: string): boolean {
  if (allowedOrigin.startsWith('*.')) {
    const domain = allowedOrigin.slice(2)
    try {
      const host = new URL(requestOrigin).hostname
      return host === domain || host.endsWith(`.${domain}`)
    } catch {
      return false
    }
  }

  return requestOrigin === allowedOrigin
}

/**
 * Verify that the request origin matches our allowed origins
 */
export function verifyCsrfToken(request: NextRequest): boolean {
  // Skip CSRF check for GET, HEAD, OPTIONS requests (safe methods)
  const method = request.method.toUpperCase()
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true
  }

  const requestOrigin = extractRequestOrigin(request)

  // In development, allow localhost and local hostnames
  if (process.env.NODE_ENV === 'development' && requestOrigin) {
    if (requestOrigin.includes('localhost') || requestOrigin.includes('127.0.0.1')) {
      return true
    }
  }

  if (!requestOrigin) {
    // In development, allow requests without origin (e.g., same-origin)
    if (process.env.NODE_ENV === 'development') {
      return true
    }
    logger.warn('CSRF check failed: No origin or referer header')
    return false
  }

  // Check if origin is in allowed list
  const allowedOrigins = resolveAllowedOrigins(request)
  const isAllowed = allowedOrigins.some((allowedOrigin) =>
    isOriginAllowed(requestOrigin, allowedOrigin)
  )

  if (!isAllowed) {
    logger.warn(`CSRF check failed: Origin ${requestOrigin} not in allowed list`)
  }

  return isAllowed
}

/**
 * Middleware to add CSRF protection to API routes
 */
export async function withCsrfProtection(
  handler: (req: NextRequest) => Promise<Response>,
  request: NextRequest
): Promise<Response> {
  if (!verifyCsrfToken(request)) {
    return new Response(
      JSON.stringify({ error: 'Invalid origin. Possible CSRF attack.' }),
      { 
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  return handler(request)
}

/**
 * Generate CSRF token (for token-based implementation)
 * This is a more robust approach for future enhancement
 */
export function generateCsrfToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Set security headers to prevent CSRF and other attacks
 */
export function getSecurityHeaders() {
  return {
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    
    // Enable XSS filtering
    'X-XSS-Protection': '1; mode=block',
    
    // Prevent clickjacking
    'X-Frame-Options': 'SAMEORIGIN',
    
    // Referrer policy
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    
    // Permissions policy (formerly Feature-Policy)
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  }
}
