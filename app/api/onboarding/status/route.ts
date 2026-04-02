import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prefs = await prisma.accountPreferences.findUnique({
    where: { userId: session.user.id },
    select: { onboardingCompletedAt: true, onboardingSkippedAt: true },
  })

  const needsOnboarding = !prefs || (!prefs.onboardingCompletedAt && !prefs.onboardingSkippedAt)

  return NextResponse.json({ needsOnboarding })
}
