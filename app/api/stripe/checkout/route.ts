import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { stripe, PREMIUM_PRICE_ID } from '@/lib/stripe'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('/api/stripe/checkout')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.users.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, stripeCustomerId: true, premiumUntil: true },
  })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Already premium — send to billing portal instead
  if (user.premiumUntil && user.premiumUntil > new Date()) {
    if (!user.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
    }
    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.NEXTAUTH_URL}/profile`,
    })
    return NextResponse.json({ url: portal.url })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? ''

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    })
    customerId = customer.id
    await prisma.users.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    })
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PREMIUM_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/profile?premium=success`,
    cancel_url: `${origin}/profile`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { userId: user.id },
    },
  })

  log.info('Checkout session created', { userId: user.id })
  return NextResponse.json({ url: checkoutSession.url })
}
