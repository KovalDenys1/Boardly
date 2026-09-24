import { NextRequest, NextResponse } from 'next/server'
import { getStripe, PREMIUM_PRICE_ID_YEARLY } from '@/lib/stripe'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import Stripe from 'stripe'
import { pushRoleConnection } from '@/lib/discord/role-connection'
import { sendPremiumConfirmationEmail } from '@/lib/email'
import type { PremiumPlan } from '@/lib/premium-plans'

const log = apiLogger('/api/stripe/webhook')

// Re-pushes the Discord Linked Roles metadata after a premium change, so the Premium role
// follows the subscription the same day rather than at the nightly sync (#939). Like
// stampFirstGrant this is not entitlement: it runs after the row is written and must never
// fail the webhook, so pushRoleConnection's own never-throws contract is wrapped once more.
async function pushDiscordRoleForCustomer(customerId: string, fallbackUserId: string | null) {
  try {
    const user = await prisma.users.findFirst({
      where: fallbackUserId
        ? { OR: [{ stripeCustomerId: customerId }, { id: fallbackUserId }] }
        : { stripeCustomerId: customerId },
      select: { id: true },
    })
    if (!user) return
    const result = await pushRoleConnection(user.id)
    if (result.status !== 'skipped') {
      log.info('Discord role connection after premium change', { userId: user.id, status: result.status })
    }
  } catch (error) {
    log.error('failed to push Discord role connection after premium change', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

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

// ---------------------------------------------------------------------------
// The record of the sale and its confirmation (#1164)
//
// angrerettloven section 18 wants, within reasonable time after the contract,
// a confirmation on a durable medium that repeats the section 8 information
// and states that the buyer asked for the service to start at once;
// ehandelsloven section 12 wants an order confirmation. Checkout (#1162) puts
// the consent on the Checkout Session's metadata and on the subscription's.
// Here it becomes a PurchaseConsents row, and the confirmation email goes out
// exactly once per session.
// ---------------------------------------------------------------------------

type ConsentMetadata = {
  userId: string | null
  termsVersion: string
  withdrawalInfoVersion: string
  consentAt: Date
  consentReceivedAt: Date
}

// The four consent keys are written together by the checkout route, so a
// session either carries the full set or none of it. Sessions created before
// that release carry none, and they must still grant Premium; the caller
// handles the null.
function readConsentMetadata(metadata: Stripe.Metadata | null | undefined): ConsentMetadata | null {
  if (!metadata) return null
  const { consentTermsVersion, consentWithdrawalInfoVersion, consentAt, consentReceivedAt, userId } = metadata
  if (!consentTermsVersion || !consentWithdrawalInfoVersion || !consentAt || !consentReceivedAt) {
    return null
  }
  const at = new Date(consentAt)
  const receivedAt = new Date(consentReceivedAt)
  if (Number.isNaN(at.getTime()) || Number.isNaN(receivedAt.getTime())) {
    return null
  }
  return {
    userId: typeof userId === 'string' && userId.length > 0 ? userId : null,
    termsVersion: consentTermsVersion,
    withdrawalInfoVersion: consentWithdrawalInfoVersion,
    consentAt: at,
    consentReceivedAt: receivedAt,
  }
}

// Which plan was bought is read off the subscription's price, not the metadata:
// the price is what Stripe actually billed. Anything that is not the yearly
// price is monthly, and an empty PREMIUM_PRICE_ID_YEARLY can never match.
function planFromSubscription(subscription: Stripe.Subscription): PremiumPlan {
  const priceId = subscription.items.data[0]?.price?.id
  return PREMIUM_PRICE_ID_YEARLY !== '' && priceId === PREMIUM_PRICE_ID_YEARLY ? 'yearly' : 'monthly'
}

type Purchaser = { id: string; email: string | null; username: string | null }

// The buyer, by the customer id first. updateSubscriptionState has already
// repaired a stale stripeCustomerId by the time this runs, so the customer id
// resolves in the recovery case too; the metadata userId is the last resort.
async function resolvePurchaser(customerId: string, fallbackUserId: string | null): Promise<Purchaser | null> {
  const select = { id: true, email: true, username: true } as const
  const byCustomer = await prisma.users.findUnique({ where: { stripeCustomerId: customerId }, select })
  if (byCustomer) return byCustomer
  if (!fallbackUserId) return null
  return prisma.users.findUnique({ where: { id: fallbackUserId }, select })
}

// Sends the confirmation at most once per Checkout Session, whatever happens
// to the event around it. The sequence is fixed:
//
//   1. claim: updateMany where confirmationSentAt IS NULL. Postgres makes this
//      atomic, so of two concurrent runs exactly one sees count 1.
//   2. send, only after a count of 1.
//   3. on a failed send, put confirmationSentAt back to null and log at error
//      level, so the row is visibly unconfirmed and a later run can send.
//
// Nothing in here throws. A throw would reach POST, release the event claim
// and make Stripe redeliver, and a redelivery after step 2 succeeded would be
// stopped only by the claim, which is exactly the state a thrown error could
// have left half-written. So the failure modes are logged, never raised.
async function sendPurchaseConfirmationOnce(
  checkoutSessionId: string,
  purchaser: Purchaser,
  details: Parameters<typeof sendPremiumConfirmationEmail>[1]
): Promise<void> {
  if (!purchaser.email) {
    // The row stands with confirmationSentAt null, so the missing send is visible.
    log.warn('Purchase confirmation has no email address to go to', { checkoutSessionId, userId: purchaser.id })
    return
  }

  try {
    const claimed = await prisma.purchaseConsents.updateMany({
      where: { checkoutSessionId, confirmationSentAt: null },
      data: { confirmationSentAt: new Date() },
    })
    if (claimed.count !== 1) {
      log.info('Purchase confirmation already sent', { checkoutSessionId })
      return
    }
  } catch (error) {
    log.error('failed to claim purchase confirmation', error, { checkoutSessionId })
    return
  }

  let result: { success: boolean; error?: string }
  try {
    result = await sendPremiumConfirmationEmail(purchaser.email, details)
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) }
  }

  if (result.success) {
    log.info('Purchase confirmation sent', { checkoutSessionId, userId: purchaser.id })
    return
  }

  log.error('failed to send purchase confirmation', undefined, {
    checkoutSessionId,
    userId: purchaser.id,
    error: result.error,
  })
  try {
    await prisma.purchaseConsents.updateMany({
      where: { checkoutSessionId },
      data: { confirmationSentAt: null },
    })
  } catch (error) {
    log.error('failed to release purchase confirmation claim', error, { checkoutSessionId })
  }
}

// Runs after the entitlement is written. Writing the row may still throw, and
// while a retry could help it does: nothing has been sent yet, and every step
// before this one is idempotent, so a redelivery repeats them harmlessly and
// gives the record a second chance. Past RETRYABLE_EVENT_AGE_MS the failure is
// logged instead, for the same reason stampFirstGrant never throws.
async function recordPurchaseConsent(
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
  customerId: string
): Promise<void> {
  const checkoutSessionId = session.id
  const consent = readConsentMetadata(session.metadata) ?? readConsentMetadata(subscription.metadata)
  if (!consent) {
    log.warn('Checkout session without consent metadata', { checkoutSessionId, customerId })
    return
  }

  const plan = planFromSubscription(subscription)
  let purchaser: Purchaser | null
  try {
    purchaser = await resolvePurchaser(customerId, consent.userId ?? metadataUserId(subscription))
    if (!purchaser) {
      // The entitlement write just matched a row, so this cannot normally
      // happen; a retry would not find one either.
      log.error('Purchase consent matched no user', undefined, { checkoutSessionId, customerId })
      return
    }
    const record = {
      userId: purchaser.id,
      stripeSubscriptionId: subscription.id,
      plan,
      termsVersion: consent.termsVersion,
      withdrawalInfoVersion: consent.withdrawalInfoVersion,
      consentAt: consent.consentAt,
      consentReceivedAt: consent.consentReceivedAt,
    }
    // Keyed on the session id, so a redelivered event rewrites the same row
    // with the same values and never adds a second one. confirmationSentAt is
    // deliberately absent from both halves: only the claim below touches it.
    await prisma.purchaseConsents.upsert({
      where: { checkoutSessionId },
      create: { checkoutSessionId, ...record },
      update: record,
    })
  } catch (error) {
    if (isWorthRetrying(event)) throw error
    log.error('failed to record purchase consent', error, { checkoutSessionId, customerId })
    return
  }

  const conversion = session.currency_conversion
  await sendPurchaseConfirmationOnce(checkoutSessionId, purchaser, {
    username: purchaser.username,
    plan,
    // What was actually charged, which Adaptive Pricing may have converted;
    // the price's own amount is only a fallback for a session without a total.
    amountTotal: session.amount_total ?? subscription.items.data[0]?.price?.unit_amount ?? 0,
    currency: session.currency ?? subscription.currency,
    convertedFrom: conversion
      ? { amountTotal: conversion.amount_total, currency: conversion.source_currency }
      : null,
    renewsAt: resolveSubscriptionEnd(subscription),
    consentAt: consent.consentAt,
    termsVersion: consent.termsVersion,
  })
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
      if (updated > 0) {
        await pushDiscordRoleForCustomer(sub.customer as string, metadataUserId(sub))
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
      const revoked = await updateSubscriptionState(
        sub.customer as string,
        null,
        null,
        false,
        metadataUserId(sub)
      )
      if (revoked > 0) {
        await pushDiscordRoleForCustomer(sub.customer as string, metadataUserId(sub))
      }
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
      if (granted > 0) {
        await pushDiscordRoleForCustomer(customerId, metadataUserId(subscription))
        await recordPurchaseConsent(event, session, subscription, customerId)
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
