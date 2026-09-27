import { NextResponse } from 'next/server'
import { constantTimeEqual } from '@/lib/secret-compare'

/**
 * Authorizes the Control Panel's server-to-server calls to `/api/internal/admin/*` (#1231,
 * Control Panel #120).
 *
 * The panel shares Boardly's database but not its Resend key, Stripe key, avatar storage or
 * Redis chat store, so the moderation actions that need those run here, behind one bearer
 * secret of their own: `CONTROL_PANEL_API_SECRET`, sent as `Authorization: Bearer <secret>`.
 * It opens these routes and nothing else, and neither `CRON_SECRET` nor the Discord bot's
 * secret opens them. Same shape as `lib/discord/internal-auth.ts`: 503 when the variable is
 * unset, so a deployment that forgot it fails loudly rather than accepting nothing or
 * everything; 401 on a missing or wrong header.
 *
 * No `node:crypto` here: `proxy.ts` imports this file too, so it stays runtime-neutral.
 */

export const CONTROL_PANEL_API_SECRET_ENV = 'CONTROL_PANEL_API_SECRET'
export const CONTROL_PANEL_ADMIN_PATH_PREFIX = '/api/internal/admin/'

export function isControlPanelAdminPath(pathname: string): boolean {
  return pathname.startsWith(CONTROL_PANEL_ADMIN_PATH_PREFIX)
}

export function getControlPanelApiSecret(): string | null {
  const secret = process.env[CONTROL_PANEL_API_SECRET_ENV]?.trim()
  return secret ? secret : null
}

export function hasValidControlPanelSecret(request: Request): boolean {
  const secret = getControlPanelApiSecret()
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  if (!authHeader) return false

  return constantTimeEqual(authHeader, `Bearer ${secret}`)
}

export function authorizeControlPanelRequest(request: Request): NextResponse | null {
  if (!getControlPanelApiSecret()) {
    return NextResponse.json(
      { error: `${CONTROL_PANEL_API_SECRET_ENV} is not configured` },
      { status: 503 }
    )
  }

  if (!hasValidControlPanelSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
