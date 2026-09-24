import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiLogger } from '@/lib/logger'
import { failClosedAuthPreset, rateLimit } from '@/lib/rate-limit'
import {
  createGuestId,
  createGuestToken,
  createGuestIdentityToken,
  getGuestTokenFromRequest,
  verifyGuestToken,
  verifyGuestIdentityToken,
} from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'
import { getSignupSourceFromRequest } from '@/lib/signup-source'
import { handleApiError } from '@/lib/error-handler'
import { Prisma } from '@/prisma/client'

const limiter = rateLimit(failClosedAuthPreset)

const guestSessionSchema = z.object({
  guestName: z.string().trim().min(2).max(20).regex(/^[\w\s-]+$/u, 'Invalid characters'),
  guestToken: z.string().optional(),
  guestIdentityToken: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const log = apiLogger('POST /api/auth/guest-session')

  const rateLimitResult = await limiter(request)
  if (rateLimitResult) return rateLimitResult

  try {
    const parsed = guestSessionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Guest name must be 2-20 characters' },
        { status: 400 }
      )
    }

    const providedToken = parsed.data.guestToken || getGuestTokenFromRequest(request)
    const existingGuest = providedToken ? verifyGuestToken(providedToken) : null

    // The session token only lasts 12h. Once it expired there was nothing left
    // to recognise a returning guest by, so a new one was minted and cross-day
    // retention could not be measured (#818). The identity token outlives the
    // session and is checked as a fallback; it is signed with its own type, so
    // it cannot be used to authorise anything by itself.
    const identityGuestId = parsed.data.guestIdentityToken
      ? verifyGuestIdentityToken(parsed.data.guestIdentityToken)
      : null

    const guestId = existingGuest?.guestId || identityGuestId || createGuestId()
    const guestUser = await getOrCreateGuestUser(guestId, parsed.data.guestName, getSignupSourceFromRequest(request))
    const guestName = guestUser.username || parsed.data.guestName
    const guestToken = createGuestToken(guestUser.id, guestName)

    return NextResponse.json({
      guestId: guestUser.id,
      guestName,
      guestToken,
      guestIdentityToken: createGuestIdentityToken(guestUser.id),
    })
  } catch (error) {
    // Handle Prisma unique constraint violations specifically
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      log.warn('Username conflict during guest session creation', { error })
      return NextResponse.json(
        { 
          error: 'Username is already taken',
          translationKey: 'auth.username.taken',
          code: 'USERNAME_TAKEN' 
        },
        { status: 409 }
      )
    }

    log.error('Failed to create guest session', error as Error)
    return handleApiError(error)
  }
}
