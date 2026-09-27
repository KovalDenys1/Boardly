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
 * The profile's renewal line (#1167): the list price and period of the Price this
 * subscription is on, read off the subscription itself rather than off today's catalog, so a
 * subscriber on an older Price is shown the amount they renew at. The list price, not the
 * charge - Link converts it into the subscriber's currency at the rate on the payment day,
 * which the line says in words (Denys, 2026-09-27). Null whenever Stripe cannot answer or the
 * Price is not a plain monthly or yearly one; the profile then shows the date alone.
 */
export async function getSubscriptionRenewal(subscriptionId: string): Promise<PremiumRenewal | null> {
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
    const price = subscription.items.data[0]?.price
    const plan = price?.recurring ? PLAN_BY_INTERVAL[price.recurring.interval] : undefined
    if (!price || !plan || price.unit_amount == null || !price.currency) return null
    if ((price.recurring?.interval_count ?? 1) !== 1) return null
    return { plan, price: toPlanPrice(plan, price.unit_amount, price.currency).label }
  } catch (err) {
    log.error('Could not read the renewal price of a subscription', err instanceof Error ? err : new Error(String(err)))
    return null
  }
}
