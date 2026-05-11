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
export const PREMIUM_PRICE_AMOUNT = '$2.99'
export const PREMIUM_PRICE_LABEL = 'Boardly Premium'
