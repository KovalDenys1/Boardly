import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { comparePassword } from '@/lib/auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { withErrorHandler, AuthenticationError, assertExists } from '@/lib/error-handler'
import { apiLogger } from '@/lib/logger'
import { loginSchema } from '@/lib/validation/auth'
import { insensitiveEquals } from '@/lib/username-match'

// NOTE: the web app does NOT use this route — it signs in via
// signIn('credentials'), which NextAuth handles in app/api/auth/[...nextauth].
// This endpoint verifies a password but issues no session, so it is a second,
// independent copy of the credential check. Kept for now because it is public
// API surface that an external client could rely on; if nothing consumes it,
// delete it rather than keeping two password paths in sync. See #714.
const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/auth/login')

async function loginHandler(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const body = await request.json()
  const { email, password } = loginSchema.parse(body)

  log.info('Login attempt', { email })

  // Find user
  // `insensitiveEquals`, not a bare `equals` + `mode`: that pair compiles to an
  // unescaped ILIKE, so an address carrying `_` or `%` was a pattern and this
  // lookup could answer with a different account's row - which here reads as
  // "Invalid credentials" for a correct password (#1055).
  const user = await prisma.users.findFirst({
    where: {
      email: insensitiveEquals(email),
    },
  })

  if (!user || !user.passwordHash) {
    log.warn('Login failed: Invalid credentials', { email })
    throw new AuthenticationError('Invalid credentials')
  }

  // Verify password
  const isValid = await comparePassword(password, user.passwordHash)
  if (!isValid) {
    log.warn('Login failed: Invalid password', { email })
    throw new AuthenticationError('Invalid credentials')
  }

  if (user.suspended) {
    log.warn('Login blocked: Account suspended', { email, userId: user.id })
    throw new AuthenticationError('Account suspended')
  }

  log.info('Login successful', { userId: user.id, email })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email ?? email,
      username: user.username,
    },
  })
}

export const POST = withErrorHandler(loginHandler)
