import { NextResponse, type NextRequest } from 'next/server'
import type { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'
import { authorizeControlPanelRequest } from '@/lib/control-panel-api-auth'

/**
 * What every `/api/internal/admin/*` route does before its own work (#1231, Control Panel
 * #120): the bearer secret, then the rate limit, then the JSON body.
 *
 * The limit counts against the panel as one caller, not its address: it runs on Vercel,
 * whose egress addresses change, and the secret has already said who it is. 30 a minute
 * is far above what a person clicking through moderation produces and low enough that a
 * runaway loop or a leaked secret cannot empty the table or the mail quota in a minute.
 *
 * The panel writes AdminAuditLogs itself, so these routes log ids only, never an address.
 */

const CONTROL_PANEL_CALLER = 'control-panel'

const controlPanelLimiter = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyScope: 'internal-admin',
  message: 'Too many admin requests. Please slow down.',
})

export const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

export async function guardControlPanelRequest(request: NextRequest): Promise<NextResponse | null> {
  const authError = authorizeControlPanelRequest(request)
  if (authError) return authError
  return controlPanelLimiter(request, { identity: CONTROL_PANEL_CALLER })
}

export type ControlPanelBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse }

/** The body parsed by `schema`, or the 400 to answer with. */
export async function parseControlPanelBody<Schema extends z.ZodTypeAny>(
  request: NextRequest,
  schema: Schema
): Promise<ControlPanelBody<z.infer<Schema>>> {
  const raw: unknown = await request.json().catch(() => undefined)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { code: 'INVALID_BODY', details: parsed.error.flatten() },
        { status: 400, headers: NO_STORE_HEADERS }
      ),
    }
  }
  return { ok: true, data: parsed.data }
}

export function controlPanelJson(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}
