import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
