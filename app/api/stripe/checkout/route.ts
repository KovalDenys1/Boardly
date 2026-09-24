import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { getStripe, PREMIUM_PRICE_ID, PREMIUM_PRICE_ID_YEARLY } from '@/lib/stripe'
import { CONSENT_REQUIRED_CODE, checkoutRequestSchema, type CheckoutRequest } from '@/lib/validation/stripe-checkout'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const log = apiLogger('/api/stripe/checkout')
// cancel and reactivate were limited from the start; checkout was not, so an
// authenticated caller could loop it into unbounded Stripe checkout sessions
// and, on the stale-customer path, unbounded customer objects (#805).
const limiter = rateLimit(rateLimitPresets.api)

/**
 * True if a stored stripeCustomerId no longer resolves on Stripe's side —
 * e.g. it was created under a different key/mode (test vs live) or deleted
 * directly in the Stripe dashboard. Safe to drop and recreate.
 */
function isStaleCustomerError(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === 'resource_missing' &&
    error.param === 'customer'
  )
}

/**
 * Any other Stripe-side config error (bad price ID, disabled product, etc.)
 * — not something a retry fixes, but the client still needs a clean JSON
 * error instead of an uncaught-exception 500 with no body.
 */
function toCheckoutErrorResponse(err: unknown, log: ReturnType<typeof apiLogger>) {
  if (err instanceof Stripe.errors.StripeError) {
    log.error('Stripe checkout failed', err, {
      type: err.type,
      code: err.code,
      param: 'param' in err ? err.param : undefined,
    })
    return NextResponse.json(
      { error: 'Checkout is temporarily unavailable. Please try again in a few minutes.' },
      { status: 502 }
    )
  }
  throw err
}

/**
 * Which plan the caller asked for (#926) and their express request to start
 * Premium inside the withdrawal period (#1162). The plan stays lenient: a
 * missing or unknown value is monthly, so a body that used to charge the
 * monthly price still does. The consent is not: without a fresh one, given
 * against the current terms and withdrawal text, this answers null and the
 * caller gets a 400. The one remaining body-less caller, the profile's "Manage
 * subscription" button, is served by the billing-portal branch before this runs.
 */
async function readCheckoutRequest(req: NextRequest): Promise<CheckoutRequest | null> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return null
  }
  const parsed = checkoutRequestSchema.safeParse(body)
  return parsed.success ? parsed.data : null
}

async function recreateStripeCustomer(user: { id: string; email: string | null }): Promise<string> {
  const customer = await getStripe().customers.create({
    email: user.email ?? undefined,
    metadata: { userId: user.id },
  })
  await prisma.users.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  })
  return customer.id
}

export async function POST(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) return rateLimitResult

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
    try {
      const portal = await getStripe().billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.NEXTAUTH_URL}/profile`,
      })
      return NextResponse.json({ url: portal.url })
    } catch (err) {
      if (isStaleCustomerError(err)) {
        log.warn('Stale stripeCustomerId on billing portal request, recreating', { userId: user.id })
        return NextResponse.json(
          { error: 'Your billing account needs to be reconnected — please start a new checkout.' },
          { status: 409 }
        )
      }
      return toCheckoutErrorResponse(err, log)
    }
  }

  const request = await readCheckoutRequest(req)
  if (!request) {
    return NextResponse.json(
      {
        error: 'Confirm that you ask us to start Premium now before checking out.',
        code: CONSENT_REQUIRED_CODE,
      },
      { status: 400 }
    )
  }
  const { plan, consent } = request
  // Never silently bill a different plan than the one that was chosen: if the
  // yearly price ID is missing, this is an error, not a fall back to monthly.
  const priceId = plan === 'yearly' ? PREMIUM_PRICE_ID_YEARLY : PREMIUM_PRICE_ID
  if (!priceId) {
    log.error(
      plan === 'yearly'
        ? 'STRIPE_PREMIUM_PRICE_ID_YEARLY is not configured'
        : 'STRIPE_PREMIUM_PRICE_ID is not configured'
    )
    return NextResponse.json(
      { error: 'Checkout is temporarily unavailable. Please try again in a few minutes.' },
      { status: 502 }
    )
  }

  const origin = req.headers.get('origin') ?? process.env.NEXTAUTH_URL ?? ''

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId ?? (await recreateStripeCustomer(user))

  // The record of the sale (#1162): who bought, which terms and withdrawal text
  // they saw, and when they asked for Premium to start. On the session, and
  // copied onto the subscription Stripe creates from it, so it outlives the
  // session and reads back from the customer's subscription years later.
  // Deliberately not `consent_collection.terms_of_service`: that needs a Terms
  // URL entered under the Stripe Dashboard's public business details, which is
  // not set, and Stripe rejects the session when it is missing.
  const consentMetadata = {
    userId: user.id,
    consentTermsVersion: consent.termsVersion,
    consentWithdrawalInfoVersion: consent.withdrawalInfoVersion,
    consentAt: consent.acceptedAt,
    // The client's claimed moment above is bounded to a window; this is the
    // server's own observation, so the record carries both.
    consentReceivedAt: new Date().toISOString(),
  }

  const createCheckoutSession = () =>
    getStripe().checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/profile?premium=success`,
      cancel_url: `${origin}/profile`,
      allow_promotion_codes: true,
      // The withdrawal information was given in the site's language; the
      // payment page follows the browser's rather than defaulting to English.
      locale: 'auto',
      metadata: consentMetadata,
      subscription_data: {
        metadata: consentMetadata,
      },
    })

  let checkoutSession
  try {
    checkoutSession = await createCheckoutSession()
  } catch (err) {
    if (!isStaleCustomerError(err)) {
      return toCheckoutErrorResponse(err, log)
    }
    log.warn('Stale stripeCustomerId on checkout, recreating customer', { userId: user.id })
    customerId = await recreateStripeCustomer(user)
    try {
      checkoutSession = await createCheckoutSession()
    } catch (retryErr) {
      return toCheckoutErrorResponse(retryErr, log)
    }
  }

  log.info('Checkout session created', { userId: user.id, plan })

  // Written here rather than from the browser: this is the one funnel step that can be
  // observed on the server, so it cannot be forged and it cannot be lost to a beacon that
  // never left the page. Never blocks the redirect.
  await prisma.operationalEvents
    .create({
      data: {
        eventName: 'checkout_started',
        metricType: 'flow',
        isGuest: false,
        success: true,
        source: 'stripe_checkout',
        // The plan is the one dimension this row is read by (#926): monthly and
        // yearly checkouts are the same funnel step at very different values.
        payload: { plan },
      },
    })
    .catch((err: unknown) => {
      log.error(
        'Failed to record checkout_started',
        err instanceof Error ? err : new Error(String(err)),
      )
    })

  return NextResponse.json({ url: checkoutSession.url })
}
