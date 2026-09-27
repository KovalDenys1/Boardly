import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiLogger } from '@/lib/logger'
import { deleteUserAccount } from '@/lib/account-deletion'
import {
  controlPanelJson,
  guardControlPanelRequest,
  parseControlPanelBody,
} from '@/lib/server/control-panel-api'

const log = apiLogger('POST /api/internal/admin/delete-account')

const bodySchema = z.object({
  userId: z.string().trim().min(1).max(191),
})

/**
 * Deletes an account for staff (Control Panel #120, #1231), by the path the owner's own
 * deletion takes (lib/account-deletion.ts): the Stripe subscription is cancelled and the
 * customer deleted first, then the avatar, the Discord linked-role data and the name in
 * other players' games go, then the row. The panel's own bare delete left billing running
 * on a deleted account.
 *
 * 200 `{ deleted: true, hadActiveSubscription }` · 404 `USER_NOT_FOUND`. Also, outside the
 * contract's happy paths: 409 `BOT_ACCOUNT` (bots are not deleted this way), and 502
 * `AVATAR_DELETE_FAILED` / `SUBSCRIPTION_CANCEL_FAILED`, where nothing was deleted and the
 * request is safe to retry.
 */
export async function POST(request: NextRequest) {
  const guardError = await guardControlPanelRequest(request)
  if (guardError) return guardError

  const body = await parseControlPanelBody(request, bodySchema)
  if (!body.ok) return body.response
  const { userId } = body.data

  const result = await deleteUserAccount(userId, { reason: 'moderation', log })

  switch (result.status) {
    case 'deleted':
      return controlPanelJson({ deleted: true, hadActiveSubscription: result.cancelledSubscription })
    case 'not_found':
      return controlPanelJson({ code: 'USER_NOT_FOUND' }, 404)
    case 'bot':
      return controlPanelJson({ code: 'BOT_ACCOUNT' }, 409)
    case 'avatar_failed':
      return controlPanelJson({ code: 'AVATAR_DELETE_FAILED' }, 502)
    case 'subscription_failed':
      return controlPanelJson({ code: 'SUBSCRIPTION_CANCEL_FAILED' }, 502)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
