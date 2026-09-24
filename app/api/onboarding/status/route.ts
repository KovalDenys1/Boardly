import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'

export async function GET() {
  const auth = await requireSessionUser()
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const prefs = await prisma.accountPreferences.findUnique({
    where: { userId: session.user.id },
    select: { onboardingCompletedAt: true, onboardingSkippedAt: true },
  })

  const needsOnboarding = !prefs || (!prefs.onboardingCompletedAt && !prefs.onboardingSkippedAt)

  return NextResponse.json({ needsOnboarding })
}
