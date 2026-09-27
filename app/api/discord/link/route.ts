import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserOrThrow } from '@/lib/session-user'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { AppError, withErrorHandler } from '@/lib/error-handler'
import { getDiscordConfig } from '@/lib/discord/role-connection'
import {
  createDiscordLinkStart,
  discordLinkRedirectUri,
  setDiscordLinkCookie,
} from '@/lib/discord/account-link'

// The start of a Discord link for the signed-in user (#1218). A POST, so proxy.ts's origin
// check stands in front of it, and it requires the session: the state it signs is bound to
// this user id, and the callback links to nobody else. lib/discord/account-link.ts has the
// whole flow.
const limiter = rateLimit(rateLimitPresets.api)

async function startHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

  const { user } = await getSessionUserOrThrow(req)
  const config = getDiscordConfig()
  if (!config) {
    throw new AppError('Discord is not configured', 503, 'DISCORD_NOT_CONFIGURED')
  }

  const redirectUri = discordLinkRedirectUri(req)
  const { authorizeUrl, cookieValue } = createDiscordLinkStart({
    userId: user.id,
    redirectUri,
    clientId: config.clientId,
  })

  const response = NextResponse.json({ url: authorizeUrl })
  response.headers.set('Cache-Control', 'no-store')
  setDiscordLinkCookie(response, cookieValue, redirectUri)
  return response
}

export const POST = withErrorHandler(startHandler)
export const dynamic = 'force-dynamic'
