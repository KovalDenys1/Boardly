import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { sanitizeSignupSource } from '@/lib/signup-source'
import { apiLogger } from '@/lib/logger'

const limiter = rateLimit(rateLimitPresets.auth)

/**
 * Completes attribution for an OAuth signup.
 *
 * Every other flow sends `X-Signup-Source` on the request that creates the account. OAuth
 * cannot: the redirect to the provider throws the page away, and the cookie that used to
 * bridge that gap is gone (#1067 — it required consent it never had). So the value makes
 * the round-trip in `callbackUrl` and the browser hands it back here on landing.
 *
 * First touch still wins: the column is only written while it is null, so a returning user
 * signing in again cannot overwrite where they originally came from.
 */
export async function POST(request: NextRequest) {
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let source: string | null = null
  try {
    const body = await request.json()
    source = sanitizeSignupSource(typeof body?.source === 'string' ? body.source : null)
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!source) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  try {
    // Guarded on `signupSource: null` so this is idempotent and cannot rewrite history,
    // and on `createdAt` so it only ever completes a signup that just happened rather
    // than letting an old account be labelled by anyone who crafts the URL.
    const cutoff = new Date(Date.now() - 30 * 60 * 1000)
    const { count } = await prisma.users.updateMany({
      where: { id: userId, signupSource: null, createdAt: { gte: cutoff } },
      data: { signupSource: source },
    })

    return NextResponse.json({ recorded: count > 0 })
  } catch (error) {
    apiLogger('POST /api/auth/attribution').error('Failed to record signup source', { error })
    return NextResponse.json({ error: 'Failed to record' }, { status: 500 })
  }
}
