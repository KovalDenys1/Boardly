/**
 * Shared pieces of the internal, server-to-server call that triggers a bot's turn
 * (`POST /api/game/[gameId]/bot-turn`), called from `app/api/game/create/route.ts` right
 * after a game starts and from `app/api/game/[gameId]/state/route.ts` after every human
 * move. Both call sites used to build this themselves; extracted so the fix for #1116
 * (audit S2-01) lives in one place instead of two.
 */

/**
 * A fixed origin for this app's own internal calls — never derived from the inbound
 * request. `NextRequest#nextUrl.origin` resolves from the `Host` / `X-Forwarded-Host`
 * headers (see Next's `getHostname(url, headers)`), which are attacker-influenced
 * wherever something in front of the app passes them through unverified — a proxy, a
 * self-hosted deployment, or local dev. A live check against Vercel's production edge
 * found `X-Forwarded-Host` could not redirect the call there today (Vercel routes by
 * `host`, https://vercel.com/docs/headers/request-headers), but the fix does not lean on
 * that: the target for a call this app makes to itself should never be a fact about the
 * inbound request in the first place.
 *
 * Priority: `NEXTAUTH_URL` (the app's own configured URL) — the fallback to
 * `VERCEL_URL` is for a preview deployment that has not set it — then localhost for
 * local dev with neither set.
 */
export function getInternalAppOrigin(): string {
  const configured = process.env.NEXTAUTH_URL?.trim()
  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
  }

  return 'http://localhost:3000'
}

export interface BotTurnForwardedCredentials {
  internalSecret: string | null | undefined
  authorization: string | null | undefined
  guestToken: string | null | undefined
  cookie?: string | null | undefined
}

/**
 * Headers for the internal bot-turn call. When `BOARDLY_INTERNAL_SECRET` is configured,
 * that secret is the call's only credential: the caller's `Authorization` / `Cookie` /
 * guest token are never forwarded alongside it, so a future bug in the URL (or a secret
 * that leaks) cannot also hand out the player's own session (#1116, audit S2-01).
 *
 * Without a configured secret — local dev, where `BOARDLY_INTERNAL_SECRET` is typically
 * unset — the bot-turn route has no other way to authorize the call, so the caller's own
 * credentials are forwarded as before (#870): the route re-runs the same session/guest
 * check the outer request already passed.
 */
export function buildBotTurnHeaders(credentials: BotTurnForwardedCredentials): Record<string, string> {
  const { internalSecret, authorization, guestToken, cookie } = credentials
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (internalSecret) {
    headers['X-Internal-Secret'] = internalSecret
    return headers
  }

  if (authorization) {
    headers.authorization = authorization
  }

  if (guestToken) {
    headers['X-Guest-Token'] = guestToken
  }

  if (cookie) {
    headers.cookie = cookie
  }

  return headers
}
