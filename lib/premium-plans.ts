/**
 * The two billing periods Premium is sold on, and the arithmetic /premium and
 * the checkout route both need (#926).
 *
 * Deliberately free of the Stripe SDK so a client component can import it:
 * resolving a plan to a real amount is `lib/server/premium-pricing.ts`, this
 * file only shapes and formats what Stripe returned. Nothing here invents a
 * price – every number in `PremiumPlanPrice` comes off a Stripe Price object,
 * so the page cannot display an amount the account would not charge.
 */

export const PREMIUM_PLANS = ['monthly', 'yearly'] as const

export type PremiumPlan = (typeof PREMIUM_PLANS)[number]

export const DEFAULT_PREMIUM_PLAN: PremiumPlan = 'yearly'

export function isPremiumPlan(value: unknown): value is PremiumPlan {
  return typeof value === 'string' && (PREMIUM_PLANS as readonly string[]).includes(value)
}

/** One Stripe Price, reduced to what the page renders. */
export type PremiumPlanPrice = {
  plan: PremiumPlan
  /** Stripe's `unit_amount`: minor units for USD/EUR/NOK, whole units for JPY. */
  unitAmount: number
  /** Stripe's `currency`: lower-case ISO 4217. */
  currency: string
  /** `unitAmount` rendered for display, e.g. "$2.99". */
  label: string
}

export type PremiumPricing = {
  monthly: PremiumPlanPrice | null
  yearly: PremiumPlanPrice | null
}

/**
 * The currency's minor-unit divisor, taken from Intl rather than a hand-kept
 * list: 100 for USD, 1 for the zero-decimal currencies such as JPY. Stripe
 * counts in exactly those units, so this converts a `unit_amount` into the
 * number a person reads.
 */
function minorUnitDivisor(currency: string): number {
  try {
    const digits = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).resolvedOptions().maximumFractionDigits
    return 10 ** (digits ?? 2)
  } catch {
    return 100
  }
}

/** A Stripe `unit_amount` as the number a person reads: 299 USD cents -> 2.99. */
export function majorUnitAmount(unitAmount: number, currency: string): number {
  return unitAmount / minorUnitDivisor(currency)
}

/**
 * Formats a Stripe amount in the currency Stripe reported it in. The locale is
 * fixed to en-US on purpose: this is the list price the subscription is defined
 * in, the same one `PREMIUM_BASE_PRICE` spells out, and Adaptive Pricing
 * decides what a given customer is actually billed (#919). Formatting it per
 * visitor would also differ between the server render and the client one.
 */
export function formatStripeAmount(unitAmount: number, currency: string): string {
  const value = majorUnitAmount(unitAmount, currency)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      // Whole amounts read better without ".00" on a pricing page; anything
      // with cents keeps them.
      minimumFractionDigits: Number.isInteger(value) ? 0 : undefined,
    }).format(value)
  } catch {
    return `${value} ${currency.toUpperCase()}`
  }
}

export function toPlanPrice(plan: PremiumPlan, unitAmount: number, currency: string): PremiumPlanPrice {
  return { plan, unitAmount, currency, label: formatStripeAmount(unitAmount, currency) }
}

/**
 * What the yearly plan costs per month, so the two plans can be compared on the
 * same axis. Derived from the yearly Stripe amount, never typed.
 */
export function yearlyPerMonthLabel(yearly: PremiumPlanPrice): string {
  return formatStripeAmount(Math.round(yearly.unitAmount / 12), yearly.currency)
}

/**
 * How much the yearly plan saves against twelve monthly charges, rounded down
 * so the claim is never larger than the truth. `null` – and therefore no
 * savings badge – unless both prices are known and priced in one currency,
 * because a percentage across two currencies would be made up.
 */
export function yearlySavingsPercent(pricing: PremiumPricing): number | null {
  const { monthly, yearly } = pricing
  if (!monthly || !yearly) return null
  if (monthly.currency !== yearly.currency) return null
  const twelveMonths = monthly.unitAmount * 12
  if (twelveMonths <= 0 || yearly.unitAmount >= twelveMonths) return null
  return Math.floor(((twelveMonths - yearly.unitAmount) / twelveMonths) * 100)
}
