import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiLogger } from '@/lib/logger'
import { removeProfileContent } from '@/lib/server/profile-content-removal'
import {
  controlPanelJson,
  guardControlPanelRequest,
  parseControlPanelBody,
} from '@/lib/server/control-panel-api'

const log = apiLogger('POST /api/internal/admin/remove-content')

const bodySchema = z.object({
  userId: z.string().trim().min(1).max(191),
  field: z.enum(['bio', 'avatar', 'username']),
})

/**
 * Removes one piece of a profile for staff (Control Panel #120, #1231): the bio, the
 * profile picture (the stored file too) or the username, which is reset to a neutral
 * `Player` plus six digits. lib/server/profile-content-removal.ts has the details.
 *
 * 200 `{ removed: true, username? }`, `username` being the new name after a reset · 404
 * `USER_NOT_FOUND`. Also 409 `BOT_ACCOUNT` (a bot is found by its username, so renaming
 * one breaks every add-bot), and 502 `AVATAR_DELETE_FAILED` when storage refused the
 * delete; the row is then unchanged and the request safe to retry.
 */
export async function POST(request: NextRequest) {
  const guardError = await guardControlPanelRequest(request)
  if (guardError) return guardError

  const body = await parseControlPanelBody(request, bodySchema)
  if (!body.ok) return body.response
  const { userId, field } = body.data

  const result = await removeProfileContent(userId, field)

  switch (result.status) {
    case 'not_found':
      return controlPanelJson({ code: 'USER_NOT_FOUND' }, 404)
    case 'bot':
      return controlPanelJson({ code: 'BOT_ACCOUNT' }, 409)
    case 'avatar_failed':
      log.warn('Avatar could not be removed from storage', { userId })
      return controlPanelJson({ code: 'AVATAR_DELETE_FAILED' }, 502)
    case 'removed':
      log.info('Profile content removed', { userId, field })
      return controlPanelJson(result.username ? { removed: true, username: result.username } : { removed: true })
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
