/**
 * Resolves the Premium plans to real money by asking Stripe for the Price
 * objects the checkout route charges (#926).
 *
 * Why this exists rather than a constant: /premium prints an amount next to a
 * buy button, and the only copy of that amount that cannot drift is the one in
 * the Stripe account. The monthly figure has a written-down fallback
 * (`PREMIUM_BASE_PRICE`, already shown on the profile page and in the FAQ); the
 * yearly one has none, so if Stripe or `STRIPE_PREMIUM_PRICE_ID_YEARLY` cannot
 * answer, the yearly plan is simply not offered. An unavailable Stripe never
 * fails the page and never invents a number.
 */

import { getStripe, PREMIUM_PRICE_ID, PREMIUM_PRICE_ID_YEARLY } from '@/lib/stripe'
import {
  toPlanPrice,
  type PremiumPlan,
  type PremiumPlanPrice,
  type PremiumPricing,
  type PremiumRenewal,
} from '@/lib/premium-plans'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('premium-pricing')

const EXPECTED_INTERVAL: Record<PremiumPlan, 'month' | 'year'> = {
  monthly: 'month',
  yearly: 'year',
}

async function resolvePlanPrice(plan: PremiumPlan, priceId: string): Promise<PremiumPlanPrice | null> {
  if (!priceId) return null
  try {
    const price = await getStripe().prices.retrieve(priceId)
    if (!price.active || price.unit_amount == null || !price.currency) return null
    // A monthly ID quietly pointing at a yearly Price would put the wrong
    // number under the wrong heading, so the interval is checked, not assumed.
    if (price.recurring?.interval !== EXPECTED_INTERVAL[plan]) {
      log.error(`Stripe price for the ${plan} plan is not billed ${EXPECTED_INTERVAL[plan]}ly`)
      return null
    }
    return toPlanPrice(plan, price.unit_amount, price.currency)
  } catch (err) {
    log.error(
      `Could not resolve the ${plan} Premium price from Stripe`,
      err instanceof Error ? err : new Error(String(err)),
    )
    return null
  }
}

/**
 * Both plans as Stripe currently defines them. Either side can be `null`; the
 * page renders whatever it gets and nothing it does not.
 */
export async function getPremiumPricing(): Promise<PremiumPricing> {
  const [monthly, yearly] = await Promise.all([
    resolvePlanPrice('monthly', PREMIUM_PRICE_ID),
    resolvePlanPrice('yearly', PREMIUM_PRICE_ID_YEARLY),
  ])
  return { monthly, yearly }
}

const PLAN_BY_INTERVAL: Partial<Record<string, PremiumPlan>> = {
  month: 'monthly',
  year: 'yearly',
}

/**
 * The Stripe call for the renewal line gets one try and three seconds (#1167). The line is a
 * nicety on the profile; a slow Stripe must cost it a missing price, not a wait, and the
 * client's defaults (80 s, with retries) would hold the request far longer than anyone waits.
 */
export const RENEWAL_STRIPE_REQUEST_OPTIONS = { timeout: 3_000, maxNetworkRetries: 0 } as const

/** A read renewal is kept this long per subscription; a failed read, a shorter while. */
export const RENEWAL_CACHE_TTL_MS = 5 * 60 * 1000
export const RENEWAL_FAILURE_CACHE_TTL_MS = 60 * 1000
const RENEWAL_CACHE_MAX_ENTRIES = 1_000

const renewalCache = new Map<string, { renewal: PremiumRenewal | null; expiresAt: number }>()

async function readSubscriptionRenewal(
  subscriptionId: string
): Promise<{ renewal: PremiumRenewal | null; failed: boolean }> {
  try {
    const subscription = await getStripe().subscriptions.retrieve(
      subscriptionId,
      {},
      RENEWAL_STRIPE_REQUEST_OPTIONS
    )
    const price = subscription.items.data[0]?.price
    const plan = price?.recurring ? PLAN_BY_INTERVAL[price.recurring.interval] : undefined
    if (!price || !plan || price.unit_amount == null || !price.currency) return { renewal: null, failed: false }
    if ((price.recurring?.interval_count ?? 1) !== 1) return { renewal: null, failed: false }
    return { renewal: { plan, price: toPlanPrice(plan, price.unit_amount, price.currency).label }, failed: false }
  } catch (err) {
    log.error('Could not read the renewal price of a subscription', err instanceof Error ? err : new Error(String(err)))
    return { renewal: null, failed: true }
  }
}

/**
 * The profile's renewal line (#1167): the list price and period of the Price this
 * subscription is on, read off the subscription itself rather than off today's catalog, so a
 * subscriber on an older Price is shown the amount they renew at. The list price before any
 * discount - Link charges it in the currency the subscriber pays with, which the line says in
 * words (Denys, 2026-09-27). Null whenever Stripe cannot answer or the Price is not a plain
 * monthly or yearly one; the profile then shows the date alone.
 *
 * Cached per subscription in this instance for RENEWAL_CACHE_TTL_MS, so reopening the profile
 * does not ask Stripe again; a failure for RENEWAL_FAILURE_CACHE_TTL_MS, so an outage costs one
 * call a minute per subscription rather than one per page view.
 */
export async function getSubscriptionRenewal(subscriptionId: string): Promise<PremiumRenewal | null> {
  const cached = renewalCache.get(subscriptionId)
  if (cached && cached.expiresAt > Date.now()) return cached.renewal

  const { renewal, failed } = await readSubscriptionRenewal(subscriptionId)
  if (renewalCache.size >= RENEWAL_CACHE_MAX_ENTRIES) renewalCache.clear()
  renewalCache.set(subscriptionId, {
    renewal,
    expiresAt: Date.now() + (failed ? RENEWAL_FAILURE_CACHE_TTL_MS : RENEWAL_CACHE_TTL_MS),
  })
  return renewal
}

export const __premiumPricingTestUtils = {
  clearRenewalCache() {
    renewalCache.clear()
  },
}
