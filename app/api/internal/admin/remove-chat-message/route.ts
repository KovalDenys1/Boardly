import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiLogger } from '@/lib/logger'
import { removeChatMessage } from '@/lib/chat-history'
import {
  controlPanelJson,
  guardControlPanelRequest,
  parseControlPanelBody,
} from '@/lib/server/control-panel-api'

const log = apiLogger('POST /api/internal/admin/remove-chat-message')

const bodySchema = z.object({
  lobbyCode: z.string().trim().min(1).max(64),
  messageId: z.string().trim().min(1).max(128),
})

/**
 * Removes one lobby chat message from the history store for staff (Control Panel #120,
 * #1231), so nobody who opens the lobby's chat afterwards is served it.
 *
 * No realtime broadcast: the chat has no removal event (useRealtimeConnection handles
 * `chat-message` and nothing that takes one away), so a signed `chat-message-removed`
 * would reach no listener. A player whose chat was open when the message arrived keeps it
 * on screen until they reload. Adding the event is a client change of its own.
 *
 * 200 `{ removed: true }` · 404 `NOT_FOUND` when the history does not hold it (never
 * stored, trimmed past the last 50, or expired after the retention window). Also 502
 * `CHAT_STORE_UNAVAILABLE` when Redis is not configured or failed; nothing is known to
 * have been removed and the request is safe to retry. 502, not 503: the panel reads every
 * 503 as this app missing CONTROL_PANEL_API_SECRET, which a Redis outage is not.
 */
export async function POST(request: NextRequest) {
  const guardError = await guardControlPanelRequest(request)
  if (guardError) return guardError

  const body = await parseControlPanelBody(request, bodySchema)
  if (!body.ok) return body.response
  const { lobbyCode, messageId } = body.data

  const result = await removeChatMessage(lobbyCode, messageId)

  switch (result) {
    case 'removed':
      log.info('Chat message removed', { lobbyCode, messageId })
      return controlPanelJson({ removed: true })
    case 'not_found':
      return controlPanelJson({ code: 'NOT_FOUND' }, 404)
    case 'unavailable':
      return controlPanelJson({ code: 'CHAT_STORE_UNAVAILABLE' }, 502)
  }
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
