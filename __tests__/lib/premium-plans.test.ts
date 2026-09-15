import {
  DEFAULT_PREMIUM_PLAN,
  formatStripeAmount,
  isPremiumPlan,
  majorUnitAmount,
  toPlanPrice,
  yearlyPerMonthLabel,
  yearlySavingsPercent,
} from '@/lib/premium-plans'

describe('premium plans (#926)', () => {
  it('accepts only the two plans that exist', () => {
    expect(isPremiumPlan('monthly')).toBe(true)
    expect(isPremiumPlan('yearly')).toBe(true)
    // No one-time unlock, no host-pays SKU, no tip jar: the decision is a
    // subscription with a yearly option, and the guard is where that holds.
    expect(isPremiumPlan('lifetime')).toBe(false)
    expect(isPremiumPlan('one_time')).toBe(false)
    expect(isPremiumPlan(undefined)).toBe(false)
    expect(DEFAULT_PREMIUM_PLAN).toBe('yearly')
  })

  it('reads a Stripe amount in the currency Stripe reported', () => {
    expect(majorUnitAmount(299, 'usd')).toBeCloseTo(2.99)
    expect(formatStripeAmount(299, 'usd')).toBe('$2.99')
    expect(formatStripeAmount(1999, 'usd')).toBe('$19.99')
    // Whole amounts drop the cents; a non-USD currency keeps its own symbol.
    expect(formatStripeAmount(29000, 'nok')).toMatch(/290/)
    expect(formatStripeAmount(29000, 'nok')).not.toMatch(/\.00/)
  })

  it('divides zero-decimal currencies by one, not by a hundred', () => {
    expect(majorUnitAmount(2900, 'jpy')).toBe(2900)
  })

  it('derives the per-month figure of a yearly price rather than taking one on trust', () => {
    expect(yearlyPerMonthLabel(toPlanPrice('yearly', 1999, 'usd'))).toBe('$1.67')
  })

  it('rounds the savings claim down so it is never larger than the truth', () => {
    const pricing = {
      monthly: toPlanPrice('monthly', 299, 'usd'),
      yearly: toPlanPrice('yearly', 1999, 'usd'),
    }
    // 12 x 299 = 3588; 1999 is 44.28 % off, and the badge must say 44.
    expect(yearlySavingsPercent(pricing)).toBe(44)
  })

  it('claims no savings when there is nothing to compare', () => {
    const monthly = toPlanPrice('monthly', 299, 'usd')
    expect(yearlySavingsPercent({ monthly, yearly: null })).toBeNull()
    expect(yearlySavingsPercent({ monthly: null, yearly: toPlanPrice('yearly', 1999, 'usd') })).toBeNull()
    // Two currencies cannot be compared, so no percentage is invented.
    expect(yearlySavingsPercent({ monthly, yearly: toPlanPrice('yearly', 1999, 'eur') })).toBeNull()
    // A yearly plan that costs more than twelve months is not a saving.
    expect(yearlySavingsPercent({ monthly, yearly: toPlanPrice('yearly', 4000, 'usd') })).toBeNull()
  })
})
