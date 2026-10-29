import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
    })
  }
  return _stripe
}

export const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID ?? ''

/**
 * The subscription's list price, in the currency its Stripe Price is defined in
 * (USD since #791). Stripe Adaptive Pricing converts the charge into the
 * customer's own currency at checkout, so this is where the conversion starts
 * and not what a given visitor is billed — render it behind a "from", or the
 * locale's equivalent, never as a bare amount (#919).
 *
 * The only written-down copy of the figure, and only a fallback: /premium and
 * the home-page FAQ quote the price Stripe answers with (lib/server/
 * premium-pricing.ts) and use this when Stripe cannot be asked. The README
 * points at this constant instead of restating the number.
 */
export const PREMIUM_BASE_PRICE = '$2.99'
export const PREMIUM_PRICE_LABEL = 'Boardly Premium'

/**
 * The yearly subscription's Stripe Price, read exactly like the monthly one so
 * the two stay the same shape. Empty when `STRIPE_PREMIUM_PRICE_ID_YEARLY` is
 * unset, which is the signal every caller uses to fall back to monthly-only:
 * the yearly plan is never offered from a price ID this process cannot name.
 */
export const PREMIUM_PRICE_ID_YEARLY = process.env.STRIPE_PREMIUM_PRICE_ID_YEARLY ?? ''
