import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/request-auth'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/api/stripe/reactivate')

export async function POST(req: NextRequest) {
  const user = await getRequestAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.users.findUnique({
    where: { id: user.id },
    select: { stripeSubscriptionId: true },
  })

  if (!dbUser?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 })
  }

  await getStripe().subscriptions.update(dbUser.stripeSubscriptionId, {
    cancel_at_period_end: false,
  })

  // Update DB immediately so UI reflects the change without waiting for the webhook
  await prisma.users.update({
    where: { id: user.id },
    data: { premiumCancelAtPeriod: false },
  })

  log.info('Subscription reactivated', { userId: user.id })
  return NextResponse.json({ success: true })
}
