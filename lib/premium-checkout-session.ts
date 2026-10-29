import type Stripe from 'stripe'

export type PremiumCheckoutSessionInput = {
  customerId: string
  priceId: string
  /** The site origin the buyer returns to, e.g. https://boardly.online. */
  origin: string
  /** The record of the sale (#1162), written to the session and its subscription. */
  metadata: Record<string, string>
}

/**
 * The Checkout Session a Premium purchase opens (#1179), built in one place so
 * the route, its tests and a test-mode check against Stripe all send the same
 * object.
 *
 * Premium is sold through Stripe Managed Payments: Sold through Link, LLC is
 * the merchant of record, collects and remits VAT and sales tax, and sends the
 * receipts and invoices. Enabling it is per session; the Dashboard's "Enable by
 * default" is off, so a session without `managed_payments` would be an
 * ordinary Stripe sale again. It needs API version 2025-03-31.basil or later
 * (lib/stripe.ts pins 2026-04-22.dahlia).
 *
 * Managed Payments refuses a list of parameters, among them `automatic_tax`,
 * `tax_id_collection`, `payment_method_types`, `payment_method_configuration`,
 * `customer_update[name|address]`, `adaptive_pricing`, `invoice_creation` and
 * `subscription_data.invoice_settings`
 * (https://docs.stripe.com/payments/managed-payments/update-checkout.md,
 * "Remove unsupported parameters"). None of them is sent here, and
 * __tests__/lib/premium-checkout-session.test.ts fails if one is added.
 * Adaptive Pricing is always on under Managed Payments, which is what
 * `premium.priceNoteConversion` describes.
 */
export function buildPremiumCheckoutSessionParams(
  input: PremiumCheckoutSessionInput
): Stripe.Checkout.SessionCreateParams {
  return {
    customer: input.customerId,
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: `${input.origin}/profile?premium=success`,
    cancel_url: `${input.origin}/profile`,
    allow_promotion_codes: true,
    // The withdrawal information was given in the site's language; the
    // payment page follows the browser's rather than defaulting to English.
    locale: 'auto',
    metadata: input.metadata,
    subscription_data: {
      metadata: input.metadata,
    },
    managed_payments: { enabled: true },
  }
}
