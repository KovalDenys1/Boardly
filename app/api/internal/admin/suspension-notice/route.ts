import { createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { sendSuspensionNoticeEmail } from '@/lib/email'
import {
  controlPanelJson,
  guardControlPanelRequest,
  parseControlPanelBody,
} from '@/lib/server/control-panel-api'

const log = apiLogger('POST /api/internal/admin/suspension-notice')

const bodySchema = z.object({
  userId: z.string().trim().min(1).max(191),
  reason: z.string().trim().min(1).max(1000),
  // Required, null for "until further notice": a panel that misspelled the key must not
  // turn a temporary suspension into an indefinite one in the owner's inbox.
  expiresAt: z.string().datetime({ offset: true }).nullable(),
})

/**
 * Emails a suspended account's owner the reason, the end date or "until further notice",
 * and the appeal link (Control Panel #120, #1231). The Terms promise this email (section
 * 5); the panel suspends and then calls here, because the Resend key lives in this app.
 *
 * 200 `{ sent: true }` · 404 `USER_NOT_FOUND` · 409 `NO_EMAIL` for a guest or an account
 * without an address · 502 `SEND_FAILED` when Resend refused or is not configured.
 */
export async function POST(request: NextRequest) {
  const guardError = await guardControlPanelRequest(request)
  if (guardError) return guardError

  const body = await parseControlPanelBody(request, bodySchema)
  if (!body.ok) return body.response
  const { userId, reason, expiresAt } = body.data

  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, email: true, username: true, isGuest: true },
  })
  if (!user) {
    return controlPanelJson({ code: 'USER_NOT_FOUND' }, 404)
  }
  if (user.isGuest || !user.email) {
    return controlPanelJson({ code: 'NO_EMAIL' }, 409)
  }

  // A retried request with the same notice is delivered once (Resend keeps the key for a
  // day); a new reason or end date is a new notice.
  const noticeHash = createHash('sha256').update(`${reason}\n${expiresAt ?? ''}`).digest('hex').slice(0, 24)
  const result = await sendSuspensionNoticeEmail(user.email, {
    username: user.username,
    reason,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    idempotencyKey: `suspension-notice/${user.id}/${noticeHash}`,
  })

  if (!result.success) {
    log.warn('Suspension notice was not sent', { userId: user.id })
    return controlPanelJson({ code: 'SEND_FAILED' }, 502)
  }

  log.info('Suspension notice sent', { userId: user.id, temporary: expiresAt !== null })
  return controlPanelJson({ sent: true })
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
