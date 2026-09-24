import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getAccountPreferences,
  upsertAccountPreferences,
} from '@/lib/account-preferences'
import { requireSessionUser } from '@/lib/session-user'

const updateSchema = z.object({
  profileVisibility: z.enum(['public', 'friends', 'private']).optional(),
  showOnlineStatus: z.boolean().optional(),
})

export async function GET() {
  const auth = await requireSessionUser()
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const preferences = await getAccountPreferences(session.user.id)
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
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const preferences = await upsertAccountPreferences(session.user.id, parsed.data)
  return NextResponse.json({ success: true, preferences })
}
