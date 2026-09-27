import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/request-auth'
import { prisma } from '@/lib/db'
import { getSubscriptionRenewal } from '@/lib/server/premium-pricing'

// Returns current premium status — used by profile page
export async function GET(req: NextRequest) {
  const user = await getRequestAuthUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.users.findUnique({
    where: { id: user.id },
    select: {
      premiumUntil: true,
      stripeSubscriptionId: true,
      premiumCancelAtPeriod: true,
    },
  })

  const isPremium = !!dbUser?.premiumUntil && dbUser.premiumUntil > new Date()
  const cancelAtPeriodEnd = dbUser?.premiumCancelAtPeriod ?? false

  // Only a subscription that will actually renew has a renewal price to show (#1167); asking
  // Stripe for anyone else would be a call for a line the profile does not render.
  const renewal =
    isPremium && !cancelAtPeriodEnd && dbUser?.stripeSubscriptionId
      ? await getSubscriptionRenewal(dbUser.stripeSubscriptionId)
      : null

  return NextResponse.json({
    isPremium,
    premiumUntil: dbUser?.premiumUntil ?? null,
    cancelAtPeriodEnd,
    hasSubscriptionId: !!dbUser?.stripeSubscriptionId,
    renewal,
  })
}
