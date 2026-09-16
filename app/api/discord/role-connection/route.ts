import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { AuthenticationError, withErrorHandler } from '@/lib/error-handler'
import {
  clearRoleConnection,
  hasRoleConnectionScope,
  pushRoleConnection,
} from '@/lib/discord/role-connection'

// Session-gated: every call acts on the caller's own Discord row and nothing else. The
// user's OAuth token does the Discord write, so there is nothing here worth calling on
// someone else's behalf. `api` preset rather than `auth`: /discord/link calls GET and
// POST back to back and a retry must not hit a five-per-15-minutes wall.
const limiter = rateLimit(rateLimitPresets.api)

async function requireUserId(): Promise<string> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }
  return session.user.id
}

/** Where /discord/link stands for this user: nothing linked, legacy scope, revoked, or ready. */
async function statusHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const userId = await requireUserId()
  const account = await prisma.accounts.findFirst({
    where: { userId, provider: 'discord' },
    select: { scope: true, access_token: true, refresh_token: true },
  })

  const linked = account !== null
  const hasScope = linked && hasRoleConnectionScope(account.scope)
  const hasToken = linked && Boolean(account.access_token || account.refresh_token)

  return NextResponse.json({ linked, hasScope, hasToken, ready: hasScope && hasToken })
}

async function pushHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const userId = await requireUserId()
  const result = await pushRoleConnection(userId)
  return NextResponse.json(result, { status: result.status === 'failed' ? 502 : 200 })
}

async function clearHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const userId = await requireUserId()
  const result = await clearRoleConnection(userId)
  return NextResponse.json(result, { status: result.status === 'failed' ? 502 : 200 })
}

export const GET = withErrorHandler(statusHandler)
export const POST = withErrorHandler(pushHandler)
export const DELETE = withErrorHandler(clearHandler)
export const dynamic = 'force-dynamic'
