import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import {
  createGuestId,
  createGuestToken,
  getGuestTokenFromRequest,
  verifyGuestToken,
} from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'

const limiter = rateLimit(rateLimitPresets.auth)

const guestSessionSchema = z.object({
  guestName: z.string().trim().min(2).max(20),
  guestToken: z.string().optional(),
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

    const guestId = existingGuest?.guestId || createGuestId()
    const guestUser = await getOrCreateGuestUser(guestId, parsed.data.guestName)
    const guestName = guestUser.username || parsed.data.guestName
    const guestToken = createGuestToken(guestUser.id, guestName)

    return NextResponse.json({
      guestId: guestUser.id,
      guestName,
      guestToken,
    })
  } catch (error) {
    log.error('Failed to create guest session', error as Error)
    return NextResponse.json(
      { error: 'Failed to create guest session' },
      { status: 500 }
    )
  }
}
