import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/notification-preferences'
import { requireSessionUser } from '@/lib/session-user'

const updateSchema = z.object({
  inAppNotifications: z.boolean().optional(),
  gameInvites: z.boolean().optional(),
  turnReminders: z.boolean().optional(),
  friendRequests: z.boolean().optional(),
  friendAccepted: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  unsubscribedAll: z.boolean().optional(),
  // #1154. marketingConsentAt is never accepted from the client - it is stamped
  // server-side by upsertNotificationPreferences whenever this field is present.
  marketingConsent: z.boolean().optional(),
})

export async function GET() {
  const auth = await requireSessionUser()
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const preferences = await getNotificationPreferences(session.user.id)
  return NextResponse.json({ preferences })
}

export async function PUT(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const preferences = await upsertNotificationPreferences(session.user.id, parsed.data)
  return NextResponse.json({ success: true, preferences })
}
