import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSessionUser } from '@/lib/session-user'

export async function PATCH(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ('response' in auth) {
    return auth.response
  }
  const { session } = auth

  const body = await request.json() as { action?: string }
  if (body.action !== 'complete' && body.action !== 'skip') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const now = new Date()
  const updateData = body.action === 'complete'
    ? { onboardingCompletedAt: now }
    : { onboardingSkippedAt: now }

  await prisma.accountPreferences.upsert({
    where: { userId: session.user.id },
    update: updateData,
    create: {
      userId: session.user.id,
      ...updateData,
    },
  })

  return new NextResponse(null, { status: 204 })
}
