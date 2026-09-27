import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getRequestAuthUser } from '@/lib/request-auth'
import { buildUserTopic } from '@/lib/server/realtime-signing'

export const dynamic = 'force-dynamic'

const apiLimiter = rateLimit(rateLimitPresets.api)
const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Hands the signed-in user (or guest) the name of their own realtime topic,
 * which carries invites, rematch requests and notification pokes.
 *
 * It used to be `user:{userId}`, and user ids are public, so anyone could
 * subscribe to someone else's invites or push fake ones (audit S3-05). The
 * name now carries a tag only the server can compute, and this route gives it
 * to exactly one person: the user it names.
 */
export async function GET(req: NextRequest) {
  const rateLimitResult = await apiLimiter(req)
  if (rateLimitResult) return rateLimitResult

  const user = await getRequestAuthUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }

  let topic: string | null
  try {
    topic = buildUserTopic(user.id)
  } catch {
    topic = null
  }
  if (!topic) {
    return NextResponse.json({ error: 'Realtime signing is not configured' }, { status: 503, headers: NO_STORE })
  }

  return NextResponse.json({ topic }, { headers: NO_STORE })
}
