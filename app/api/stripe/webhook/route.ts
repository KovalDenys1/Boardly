import { NextRequest, NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import Stripe from 'stripe'

const log = apiLogger('/api/stripe/webhook')

// Records that this account converted, the first time it ever does. Cancellation
// nulls premiumUntil and stripeSubscriptionId, and checkout writes
// stripeCustomerId while creating the session (recreateStripeCustomer in
// app/api/stripe/checkout/route.ts), before any payment — so without this stamp
// a churned customer is indistinguishable from someone who opened checkout and
// walked away.
//
// `premiumFirstGrantedAt: null` in the where clause is what makes the write
// once-only: a row that already carries a stamp is not matched, so renewals and
// re-subscribes cannot move it. It is a separate statement rather than a field
// on the `data` payload below because that payload also carries revokes, and a
// field there would be rewritten on every event.
async function stampFirstGrant(
  where: { stripeCustomerId: string } | { id: string },
  until: Date | null
) {
  // Only a grant converts. A revoke must leave the stamp alone.
  if (until === null) return

  // This column is analytics, not entitlement: it decides what the Control Panel
  // can report, never what a user can do. So it must not be able to fail the
  // webhook. A throw here would reach POST, become a 500, and delete the
  // idempotency claim — and `isWorthRetrying` is consulted only on the
  // `updated === 0` paths, so a thrown error would bypass the age check that
  // exists to stop sustained 5xx from getting the endpoint disabled by Stripe.
  // Entitlement has already been written by the caller at this point.
  try {
    await prisma.users.updateMany({
      where: { ...where, premiumFirstGrantedAt: null },
      data: { premiumFirstGrantedAt: new Date() },
    })
  } catch (error) {
    log.error('failed to stamp premiumFirstGrantedAt', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function updateSubscriptionState(
  customerId: string,
  subscriptionId: string | null,
  until: Date | null,
  cancelAtPeriodEnd: boolean,
  fallbackUserId?: string | null
) {
  const data = {
    premiumUntil: until,
    stripeSubscriptionId: subscriptionId,
    premiumCancelAtPeriod: cancelAtPeriodEnd,
  }

  // stripeCustomerId is unique, so this touches at most one row.
  const result = await prisma.users.updateMany({
    where: { stripeCustomerId: customerId },
    data,
  })

  if (result.count > 0) {
    await stampFirstGrant({ stripeCustomerId: customerId }, until)
    return result.count
  }

  // The customer id on the event does not match any row. That happens when
  // checkout recreated the Stripe customer after the stored id went stale, so
  // events for the old id no longer resolve. Stripe carries our own userId in
  // the subscription metadata, so recover from it and repair the stored id
  // rather than dropping a paid customer's entitlement.
  //
  // The fallback may only ever GRANT. A mismatched customer id is also exactly
  // what a superseded subscription looks like: the user already moved on to a
  // new customer and a live subscription, and the old one is cancelled later.
  // Letting a revoking event through here would clear that live entitlement and
  // rewrite stripeCustomerId back to the dead id — worse than the dropped grant
  // this fallback exists to prevent.
  if (fallbackUserId && until !== null) {
    const repaired = await prisma.users.updateMany({
      where: { id: fallbackUserId },
      data: { ...data, stripeCustomerId: customerId },
    })

    if (repaired.count > 0) {
      // Stamped by id, not by customer id: this branch is the one that repairs a
      // stale stripeCustomerId, so matching on the event's customer id would only
      // work because the repair just ran. The id is what actually identified the row.
      await stampFirstGrant({ id: fallbackUserId }, until)
      log.warn('Recovered Stripe event via subscription metadata userId', {
        customerId,
        subscriptionId,
        userId: fallbackUserId,
      })
      return repaired.count
    }
  }

  log.error('Stripe subscription event matched no user', undefined, {
    customerId,
    subscriptionId,
    fallbackUserId,
  })

  return 0
}

function metadataUserId(subscription: Stripe.Subscription): string | null {
  const userId = subscription.metadata?.userId
  return typeof userId === 'string' && userId.length > 0 ? userId : null
}

function resolveSubscriptionEnd(subscription: Stripe.Subscription): Date | null {
  const isActive = subscription.status === 'active' || subscription.status === 'trialing'
  const periodEnd = subscription.items.data[0]?.current_period_end
  return isActive && periodEnd ? new Date(periodEnd * 1000) : null
}

// A delivery is only worth failing (and so retrying) while the miss could still
// be a race with checkout's own write. Past that window the event is orphaned —
// most often because the account was deleted without cancelling its Stripe
// subscription — and every renewal or status change for it would otherwise 5xx
// on each retry for Stripe's full ~3-day window. Sustained 5xx gets the endpoint
// disabled, which would stop entitlement for every customer, not just that one.
const RETRYABLE_EVENT_AGE_MS = 15 * 60 * 1000

function isWorthRetrying(event: Stripe.Event): boolean {
  return Date.now() - event.created * 1000 < RETRYABLE_EVENT_AGE_MS
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const updated = await updateSubscriptionState(
        sub.customer as string,
        sub.id,
        resolveSubscriptionEnd(sub),
        sub.cancel_at_period_end,
        metadataUserId(sub)
      )
      // Throwing releases the idempotency claim below and answers Stripe with a
      // 500 so it retries. Returning 200 here would tell Stripe the entitlement
      // was applied and burn the event id, leaving a paying customer without
      // Premium and no way for the delivery to be reprocessed. Only do it while
      // a retry could still help — see RETRYABLE_EVENT_AGE_MS.
      if (updated === 0 && isWorthRetrying(event)) {
        throw new Error(`Subscription event matched no user (customer ${sub.customer})`)
      }
      log.info(`Subscription ${event.type}`, {
        customerId: sub.customer,
        status: sub.status,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      })
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      // Deliberately does not throw on a zero-row result: if no user holds this
      // customer id there is no entitlement left to revoke, and retrying for
      // days would never succeed.
      await updateSubscriptionState(
        sub.customer as string,
        null,
        null,
        false,
        metadataUserId(sub)
      )
      log.info('Subscription deleted', { customerId: sub.customer })
      break
    }

    // Entitlement previously depended entirely on a customer.subscription.*
    // event arriving. If one was missed, a paid checkout never granted Premium
    // and nothing reconciled it. Grant on the checkout itself as well; the
    // subscription events remain the source of truth for renewals and cancels.
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription' || !session.subscription || !session.customer) {
        break
      }

      const subscriptionId =
        typeof session.subscription === 'string' ? session.subscription : session.subscription.id
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id

      // Re-read the subscription so the period end comes from Stripe rather than
      // being inferred from the checkout session.
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
      const granted = await updateSubscriptionState(
        customerId,
        subscriptionId,
        resolveSubscriptionEnd(subscription),
        subscription.cancel_at_period_end,
        metadataUserId(subscription)
      )
      if (granted === 0 && isWorthRetrying(event)) {
        throw new Error(`Checkout session matched no user (customer ${customerId})`)
      }
      log.info('Checkout session completed', { customerId, subscriptionId })
      break
    }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    // Fail loudly rather than letting constructEvent throw an opaque parse error.
    log.error('STRIPE_WEBHOOK_SECRET is not configured; cannot verify webhook')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    log.error('Webhook signature verification failed', err as Error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Claim the event id before doing any work. The primary key makes this atomic:
  // a concurrent or retried delivery of the same event loses the race and exits.
  try {
    await prisma.stripeWebhookEvents.create({
      data: { id: event.id, type: event.type },
    })
  } catch {
    log.info('Ignoring duplicate Stripe event', { eventId: event.id, type: event.type })
    return NextResponse.json({ received: true, duplicate: true })
  }

  try {
    await handleEvent(event)
  } catch (err) {
    // Release the claim so Stripe's retry can reprocess this event, rather than
    // having the ledger record a delivery that never took effect.
    await prisma.stripeWebhookEvents
      .delete({ where: { id: event.id } })
      .catch(() => undefined)

    log.error('Webhook handler error', err as Error)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
