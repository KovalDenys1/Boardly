import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'
import { LEGACY_ACCOUNT_PREFERENCES, upsertAccountPreferences } from '@/lib/account-preferences'

/**
 * `complete` and `skip` close onboarding. `account` saves the first step of it, the
 * account settings the modal asks about before the game choice: the 13-or-older
 * confirmation an OAuth account gives there (#1135), and whether to make the profile
 * public, an opt-in, never assumed (#1131).
 */
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('complete') }),
  z.object({ action: z.literal('skip') }),
  z.object({
    action: z.literal('account'),
    ageConfirmed: z.boolean().optional(),
    profilePublic: z.boolean().optional(),
  }),
])

export async function PATCH(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }
  const body = parsed.data

  if (body.action === 'account') {
    // Written once: a confirmation already on record, from sign-up or an earlier
    // visit, keeps its original time.
    if (body.ageConfirmed === true) {
      await prisma.users.updateMany({
        where: { id: session.user.id, ageConfirmedAt: null },
        data: { ageConfirmedAt: new Date() },
      })
    }
    // Only a tick opens the profile. An unticked box writes nothing, so it can never
    // narrow a profile its owner had already opened.
    if (body.profilePublic === true) {
      await upsertAccountPreferences(session.user.id, { profileVisibility: 'public' })
    }
    return new NextResponse(null, { status: 204 })
  }

  const now = new Date()
  const updateData = body.action === 'complete'
    ? { onboardingCompletedAt: now }
    : { onboardingSkippedAt: now }

  // A row created here belongs to an account that predates #1131 (new accounts get
  // theirs at sign-up), so it keeps the values that account has always had.
  await prisma.accountPreferences.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      ...LEGACY_ACCOUNT_PREFERENCES,
      ...updateData,
    },
  })

  return new NextResponse(null, { status: 204 })
}
