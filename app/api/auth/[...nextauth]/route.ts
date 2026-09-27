import NextAuth from 'next-auth'
import { NextResponse, type NextRequest } from 'next/server'
import { authOptions } from '@/lib/next-auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const handler = NextAuth(authOptions)

// Password sign-in happens here: the client calls signIn('credentials'), which
// POSTs to this catch-all. Without this the password check in
// authOptions.authorize() was completely unthrottled (#714). (A second, dead
// password-check endpoint that never issued a session used to sit beside this
// one with its own rate-limit budget — deleted in #1138.)
//
// Scoped to the credentials callback on purpose: this route also serves session,
// csrf and OAuth endpoints that the app polls routinely, and throttling those
// would break normal usage.
const CREDENTIALS_CALLBACK_PATH = '/api/auth/callback/credentials'
const credentialsLimiter = rateLimit(rateLimitPresets.credentialsLogin)

/**
 * next-auth's browser client parses `data.url` out of every credentials response
 * and calls `new URL()` on it, so a bare `{ error }` body makes signIn() throw a
 * URL parse error instead of resolving with a result the form can handle. Reshape
 * the limiter's 429 into the redirect envelope the client expects, keeping the
 * status and Retry-After intact for non-browser callers.
 */
function toClientReadableRateLimitResponse(
  rateLimitResponse: NextResponse,
  request: NextRequest
): NextResponse {
  const errorUrl = new URL('/auth/login', request.nextUrl.origin)
  errorUrl.searchParams.set('error', 'RateLimited')

  const response = NextResponse.json(
    { url: errorUrl.toString() },
    { status: rateLimitResponse.status }
  )

  const retryAfter = rateLimitResponse.headers.get('Retry-After')
  if (retryAfter) {
    response.headers.set('Retry-After', retryAfter)
  }

  return response
}

async function postHandler(request: NextRequest, context: unknown) {
  if (new URL(request.url).pathname === CREDENTIALS_CALLBACK_PATH) {
    const rateLimitResult = await credentialsLimiter(request)
    if (rateLimitResult) {
      return toClientReadableRateLimitResponse(rateLimitResult, request)
    }
  }

  return handler(request, context)
}

export { handler as GET, postHandler as POST }
