import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/request-auth'
import { prisma } from '@/lib/db'
import { getSubscriptionRenewal } from '@/lib/server/premium-pricing'

/**
 * What the signed-in subscriber's Premium renews at, for the profile's renewal line (#1167):
 * `{ renewal: { plan, price } }`, or `{ renewal: null }` when there is nothing to show or
 * Stripe could not say. Separate from GET /api/user/purchases so that the profile's first
 * render never waits on Stripe; the profile asks this afterwards and shows the date alone
 * until, or unless, it answers.
 */
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

  // Only a subscription that will actually renew has a renewal price to show.
  const renews =
    !!dbUser?.stripeSubscriptionId &&
    !!dbUser.premiumUntil &&
    dbUser.premiumUntil > new Date() &&
    !dbUser.premiumCancelAtPeriod

  const renewal = renews ? await getSubscriptionRenewal(dbUser.stripeSubscriptionId as string) : null

  return NextResponse.json({ renewal }, { headers: { 'Cache-Control': 'private, no-store' } })
}
