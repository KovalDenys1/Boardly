import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

export const PREMIUM_PRICE_ID = process.env.STRIPE_PREMIUM_PRICE_ID!
export const PREMIUM_PRICE_AMOUNT = '$2.99'
export const PREMIUM_PRICE_LABEL = 'Boardly Premium'
