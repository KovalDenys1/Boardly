import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { ValidationError, withErrorHandler } from '@/lib/error-handler'
import { isValidProfileEmail, normalizeProfileEmail } from '@/lib/profile-email'

const limiter = rateLimit(rateLimitPresets.api)
const log = apiLogger('GET /api/user/check-email')

async function checkEmailHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const { searchParams } = new URL(req.url)
  const emailParam = searchParams.get('email')

  if (!emailParam) {
    throw new ValidationError('Email parameter is required')
  }

  const email = normalizeProfileEmail(emailParam)

  if (!isValidProfileEmail(email)) {
    return NextResponse.json(
      {
        available: false,
        error: 'Invalid email address',
      },
      { status: 200 }
    )
  }

  const existingUser = await prisma.users.findFirst({
    where: {
      OR: [
        {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
        {
          pendingEmail: {
            equals: email,
            mode: 'insensitive',
          },
        },
      ],
    },
    select: { id: true },
  })

  const available = !existingUser

  log.info('Email check completed', { email, available })

  return NextResponse.json({
    available,
    email,
  })
}

export const GET = withErrorHandler(checkEmailHandler)
