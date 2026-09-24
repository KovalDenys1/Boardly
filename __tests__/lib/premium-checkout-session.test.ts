import { buildPremiumCheckoutSessionParams } from '@/lib/premium-checkout-session'

/**
 * The parameters Stripe refuses on a Managed Payments Checkout Session in
 * subscription mode, copied from the "Remove unsupported parameters" table of
 * https://docs.stripe.com/payments/managed-payments/update-checkout.md
 * (read 2026-09-24). Sending any one of them fails the session, so a checkout
 * that quietly gains one would break every Premium purchase.
 */
const REFUSED_TOP_LEVEL = [
  'adaptive_pricing',
  'automatic_tax',
  'tax_id_collection',
  'payment_method_configuration',
  'payment_method_types',
  'shipping_address_collection',
  'shipping_options',
  'invoice_creation',
] as const

const REFUSED_SUBSCRIPTION_DATA = [
  'default_tax_rates',
  'application_fee_percent',
  'on_behalf_of',
  'transfer_data',
  'invoice_settings',
] as const

const metadata = {
  userId: 'user-1',
  consentTermsVersion: '2026-09-24',
  consentWithdrawalInfoVersion: '2026-09-24',
  consentAt: '2026-09-24T12:00:00.000Z',
  consentReceivedAt: '2026-09-24T12:00:01.000Z',
}

function build() {
  return buildPremiumCheckoutSessionParams({
    customerId: 'cus_1',
    priceId: 'price_monthly',
    origin: 'https://boardly.online',
    metadata,
  })
}

describe('buildPremiumCheckoutSessionParams (#1179)', () => {
  it('turns Managed Payments on for the session', () => {
    expect(build().managed_payments).toEqual({ enabled: true })
  })

  it('sends none of the parameters Managed Payments refuses', () => {
    const params = build() as Record<string, unknown>
    for (const key of REFUSED_TOP_LEVEL) {
      expect({ key, present: key in params }).toEqual({ key, present: false })
    }
    const customerUpdate = params.customer_update as Record<string, unknown> | undefined
    expect(customerUpdate?.name).toBeUndefined()
    expect(customerUpdate?.address).toBeUndefined()

    const subscriptionData = params.subscription_data as Record<string, unknown>
    for (const key of REFUSED_SUBSCRIPTION_DATA) {
      expect({ key, present: key in subscriptionData }).toEqual({ key, present: false })
    }
  })

  it('keeps what the purchase already relied on: one price, promo codes, the browser language', () => {
    const params = build()
    expect(params).toEqual(
      expect.objectContaining({
        customer: 'cus_1',
        mode: 'subscription',
        line_items: [{ price: 'price_monthly', quantity: 1 }],
        success_url: 'https://boardly.online/profile?premium=success',
        cancel_url: 'https://boardly.online/profile',
        allow_promotion_codes: true,
        locale: 'auto',
      })
    )
  })

  it('writes the consent record onto the session and onto the subscription it creates', () => {
    const params = build()
    expect(params.metadata).toEqual(metadata)
    expect(params.subscription_data).toEqual({ metadata })
  })
})
