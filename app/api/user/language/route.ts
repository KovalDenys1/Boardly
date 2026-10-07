import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { availableLocales } from '@/locales/meta'
import { requireSessionUser } from '@/lib/session-user'

const bodySchema = z.object({ language: z.enum(availableLocales) })

/**
 * Stores the site language the signed-in person uses, so every mail to them is written in it
 * (#1331). The browser calls it after sign-in and when the person switches language; the row
 * is written only when the value differs. A suspended account may still set it: the mails it
 * keeps getting (deletion, the suspension's own follow-ups) should be in its language too.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireSessionUser(request, { allowSuspended: true })
  if ('response' in auth) {
    return auth.response
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { language } = parsed.data
  const { count } = await prisma.users.updateMany({
    where: {
      id: auth.user.id,
      isGuest: false,
      OR: [{ language: null }, { language: { not: language } }],
    },
    data: { language },
  })

  return NextResponse.json({ language, changed: count > 0 })
}
