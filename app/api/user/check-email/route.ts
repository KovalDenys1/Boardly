import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { ValidationError, withErrorHandler } from '@/lib/error-handler'
import { isValidProfileEmail, normalizeProfileEmail } from '@/lib/profile-email'
import { insensitiveEquals, sameName } from '@/lib/username-match'

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

  // `insensitiveEquals`, not a bare `equals` + `mode`: that pair compiles to an
  // unescaped ILIKE, so `_` and `%` inside an address stayed live as wildcards
  // and `a_b@example.com` matched the account `aXb@example.com` (#1055).
  //
  // This endpoint has to be fixed in the same breath as PATCH /api/user/profile,
  // not after it: app/profile/page.tsx polls it and returns before sending the
  // PATCH when it answers `available: false` (the toast at :921 and the guards at
  // :832 and :941). Fixing only the writer moved the wrong answer rather than
  // removing it - the PATCH would have taken the address and the form refused to
  // offer it, so the user still read "Email is already in use" for an address
  // nobody holds. An address is also likelier to carry an underscore than a
  // display name is, which is why this is the door people actually hit.
  //
  // `findMany` and a comparison rather than `findFirst`: same split as the other
  // three call sites - the filter narrows, `sameName` decides over what it
  // returned. See lib/username-match.ts for what each half does and does not
  // guarantee.
  const candidates = await prisma.users.findMany({
    where: {
      OR: [
        { email: insensitiveEquals(email) },
        { pendingEmail: insensitiveEquals(email) },
      ],
    },
    select: { id: true, email: true, pendingEmail: true },
  })

  const available = !candidates.some(
    (row) => sameName(row.email, email) || sameName(row.pendingEmail, email)
  )

  log.info('Email check completed', { email, available })

  return NextResponse.json({
    available,
    email,
  })
}

export const GET = withErrorHandler(checkEmailHandler)
