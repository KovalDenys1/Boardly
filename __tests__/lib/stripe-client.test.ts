/**
 * @jest-environment node
 */
import Stripe from 'stripe'

describe('getStripe – the API version every request carries', () => {
  const originalKey = process.env.STRIPE_SECRET_KEY

  beforeEach(() => {
    jest.resetModules()
    process.env.STRIPE_SECRET_KEY = 'sk_test_unit'
  })

  afterAll(() => {
    process.env.STRIPE_SECRET_KEY = originalKey
  })

  function clientVersion(): string {
    const { getStripe } = jest.requireActual<typeof import('@/lib/stripe')>('@/lib/stripe')
    return getStripe().getApiField('version')
  }

  it('is the version the installed stripe-node is typed for, so responses match the types the code reads', () => {
    expect(clientVersion()).toBe(Stripe.API_VERSION)
  })

  it('is an endive version, the release the webhook endpoint is created at', () => {
    expect(clientVersion()).toMatch(/^\d{4}-\d{2}-\d{2}\.endive$/)
  })
})
