import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { markAllInAppNotificationsRead, markInAppNotificationsRead } from '@/lib/in-app-notifications'
import { requireSessionUser } from '@/lib/session-user'

const schema = z
  .object({
    ids: z.array(z.string()).optional(),
    all: z.boolean().optional(),
  })
  .refine((value) => value.all || (value.ids && value.ids.length > 0), {
    message: 'ids or all is required',
  })

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const result = parsed.data.all
    ? await markAllInAppNotificationsRead(session.user.id)
    : await markInAppNotificationsRead(session.user.id, parsed.data.ids ?? [])

  return NextResponse.json({
    success: true,
    count: result.count,
  })
}
