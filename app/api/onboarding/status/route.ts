import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'
import { LEGACY_ACCOUNT_PREFERENCES } from '@/lib/account-preferences'
import { needsAgeConfirmation } from '@/lib/age-confirmation'

export async function GET() {
  const auth = await requireSessionUser()
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const [prefs, user] = await Promise.all([
    prisma.accountPreferences.findUnique({
      where: { userId: session.user.id },
      select: { onboardingCompletedAt: true, onboardingSkippedAt: true, profileVisibility: true },
    }),
    prisma.users.findUnique({
      where: { id: session.user.id },
      select: { ageConfirmedAt: true, createdAt: true, isGuest: true },
    }),
  ])

  // An OAuth account confirms its age in onboarding (#1135). Until it has, onboarding is
  // not over, even after a skip, so the modal comes back on the next visit.
  const ageConfirmationNeeded = user ? needsAgeConfirmation(user) : false
  const needsOnboarding =
    !prefs || (!prefs.onboardingCompletedAt && !prefs.onboardingSkippedAt) || ageConfirmationNeeded

  // The onboarding modal offers to open a profile that is not public (#1131); a new
  // account's is friends-only until its owner says otherwise.
  const profileVisibility = prefs?.profileVisibility ?? LEGACY_ACCOUNT_PREFERENCES.profileVisibility

  return NextResponse.json({ needsOnboarding, needsAgeConfirmation: ageConfirmationNeeded, profileVisibility })
}
