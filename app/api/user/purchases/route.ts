import { NextRequest, NextResponse } from 'next/server'
import { getRequestAuthUser } from '@/lib/request-auth'
import { prisma } from '@/lib/db'

// Returns current premium status — used by profile page. Database only: the renewal price
// needs Stripe, so it has its own route (./renewal) that the profile asks after it has
// rendered, and a slow Stripe never holds up this one (#1167).
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

  return NextResponse.json({
    isPremium,
    premiumUntil: dbUser?.premiumUntil ?? null,
    cancelAtPeriodEnd: dbUser?.premiumCancelAtPeriod ?? false,
    hasSubscriptionId: !!dbUser?.stripeSubscriptionId,
  })
}
