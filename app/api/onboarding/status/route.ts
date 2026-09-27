import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'
import { LEGACY_ACCOUNT_PREFERENCES } from '@/lib/account-preferences'

export async function GET() {
  const auth = await requireSessionUser()
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const prefs = await prisma.accountPreferences.findUnique({
    where: { userId: session.user.id },
    select: { onboardingCompletedAt: true, onboardingSkippedAt: true, profileVisibility: true },
  })

  const needsOnboarding = !prefs || (!prefs.onboardingCompletedAt && !prefs.onboardingSkippedAt)

  // The onboarding modal offers to open a profile that is not public (#1131); a new
  // account's is friends-only until its owner says otherwise.
  const profileVisibility = prefs?.profileVisibility ?? LEGACY_ACCOUNT_PREFERENCES.profileVisibility

  return NextResponse.json({ needsOnboarding, profileVisibility })
}
