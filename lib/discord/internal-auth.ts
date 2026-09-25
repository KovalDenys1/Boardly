import { NextResponse } from 'next/server'
import { constantTimeEqual } from '@/lib/secret-compare'

/**
 * Authorizes the Discord bot's server-to-server calls to `/api/internal/discord/*`.
 *
 * A copy of `lib/cron-auth.ts` on its own secret. The bot on the Raspberry Pi holds no
 * database credentials and no cron secret: it gets one bearer token that opens exactly
 * two read-mostly routes (member lookup, heartbeat), so a leaked Pi env file cannot run
 * the crons and a leaked `CRON_SECRET` cannot read members.
 *
 * The secret is `DISCORD_INTERNAL_SECRET`, sent as `Authorization: Bearer <secret>`.
 * 503 when it is unset, so a deployment that forgot the variable fails loudly rather
 * than accepting nothing or everything; 401 on a missing or wrong header.
 *
 * No `node:crypto` here: `proxy.ts` imports this file too, so it stays runtime-neutral.
 */

export const DISCORD_INTERNAL_SECRET_ENV = 'DISCORD_INTERNAL_SECRET'

// Re-exported for callers that already import the comparator from here; `lib/secret-compare.ts`
// is the one implementation, shared with `lib/cron-auth.ts` and the bot-turn route (#1119).
export { constantTimeEqual }

export function getDiscordInternalSecret(): string | null {
  const secret = process.env[DISCORD_INTERNAL_SECRET_ENV]?.trim()
  return secret ? secret : null
}

export function hasValidDiscordInternalSecret(request: Request): boolean {
  const secret = getDiscordInternalSecret()
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  return constantTimeEqual(authHeader, `Bearer ${secret}`)
}

export function authorizeDiscordInternalRequest(request: Request): NextResponse | null {
  if (!getDiscordInternalSecret()) {
    return NextResponse.json(
      { error: `${DISCORD_INTERNAL_SECRET_ENV} is not configured` },
      { status: 503 }
    )
  }

  if (!hasValidDiscordInternalSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
