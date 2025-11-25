import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { comparePassword, createToken } from '@/lib/auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { withErrorHandler, AuthenticationError, assertExists } from '@/lib/error-handler'
import { apiLogger } from '@/lib/logger'
import { loginSchema } from '@/lib/validation/auth'

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
  const user = await prisma.user.findUnique({
    where: { email },
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

  // Create JWT token
  const token = createToken({ userId: user.id, email: user.email ?? email })

  log.info('Login successful', { userId: user.id, email })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email ?? email,
      username: user.username,
    },
    token,
  })
}

export const POST = withErrorHandler(loginHandler)
