import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import Stripe from 'stripe'

const log = apiLogger('/api/stripe/webhook')

async function updateSubscriptionState(
  customerId: string,
  subscriptionId: string | null,
  until: Date | null,
  cancelAtPeriodEnd: boolean
) {
  await prisma.users.updateMany({
    where: { stripeCustomerId: customerId },
    data: {
      premiumUntil: until,
      stripeSubscriptionId: subscriptionId,
      premiumCancelAtPeriod: cancelAtPeriodEnd,
    },
  })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    log.error('Webhook signature verification failed', err as Error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const isActive = sub.status === 'active' || sub.status === 'trialing'
        const periodEnd = sub.items.data[0]?.current_period_end
        const until = isActive && periodEnd ? new Date(periodEnd * 1000) : null
        await updateSubscriptionState(sub.customer as string, sub.id, until, sub.cancel_at_period_end)
        log.info(`Subscription ${event.type}`, { customerId: sub.customer, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end })
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await updateSubscriptionState(sub.customer as string, null, null, false)
        log.info('Subscription deleted', { customerId: sub.customer })
        break
      }
    }
  } catch (err) {
    log.error('Webhook handler error', err as Error)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
