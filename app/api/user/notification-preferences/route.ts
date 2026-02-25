import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from '@/lib/notification-preferences'

const updateSchema = z.object({
  gameInvites: z.boolean().optional(),
  turnReminders: z.boolean().optional(),
  friendRequests: z.boolean().optional(),
  friendAccepted: z.boolean().optional(),
  unsubscribedAll: z.boolean().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const preferences = await getNotificationPreferences(session.user.id)
  return NextResponse.json({ preferences })
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 })
  }

  const preferences = await upsertNotificationPreferences(session.user.id, parsed.data)
  return NextResponse.json({ success: true, preferences })
}
