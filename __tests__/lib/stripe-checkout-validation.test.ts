import {
  CONSENT_CLOCK_SKEW_MS,
  CONSENT_MAX_AGE_MS,
  checkoutRequestSchema,
} from '@/lib/validation/stripe-checkout'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

function consent(overrides: Record<string, unknown> = {}) {
  return {
    termsVersion: TERMS_VERSION,
    withdrawalInfoVersion: WITHDRAWAL_INFO_VERSION,
    acceptedAt: new Date().toISOString(),
    ...overrides,
  }
}

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

describe('checkoutRequestSchema (#1162)', () => {
  it('pins the window it enforces', () => {
    expect(CONSENT_MAX_AGE_MS).toBe(24 * HOUR)
    expect(CONSENT_CLOCK_SKEW_MS).toBe(5 * MINUTE)
  })

  it('accepts a fresh consent and reads the plan', () => {
    const parsed = checkoutRequestSchema.parse({ plan: 'yearly', consent: consent() })
    expect(parsed.plan).toBe('yearly')
    expect(parsed.consent.termsVersion).toBe(TERMS_VERSION)
  })

  it('keeps the old plan leniency: missing or unknown is monthly, never an error (#926)', () => {
    expect(checkoutRequestSchema.parse({ consent: consent() }).plan).toBe('monthly')
    expect(checkoutRequestSchema.parse({ plan: 'lifetime', consent: consent() }).plan).toBe('monthly')
    expect(checkoutRequestSchema.parse({ plan: 42, consent: consent() }).plan).toBe('monthly')
  })

  it('refuses a body without consent, or with a partial one', () => {
    expect(checkoutRequestSchema.safeParse({ plan: 'monthly' }).success).toBe(false)
    expect(checkoutRequestSchema.safeParse({}).success).toBe(false)
    expect(checkoutRequestSchema.safeParse(null).success).toBe(false)
    expect(checkoutRequestSchema.safeParse({ consent: { termsVersion: TERMS_VERSION } }).success).toBe(false)
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: undefined }) }).success).toBe(false)
  })

  it('refuses a consent against any other version of either text', () => {
    expect(checkoutRequestSchema.safeParse({ consent: consent({ termsVersion: '2026-01-01' }) }).success).toBe(false)
    expect(
      checkoutRequestSchema.safeParse({ consent: consent({ withdrawalInfoVersion: '2026-01-01' }) }).success
    ).toBe(false)
    expect(checkoutRequestSchema.safeParse({ consent: consent({ termsVersion: true }) }).success).toBe(false)
  })

  it('accepts a consent up to 24 hours old and refuses an older one', () => {
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: at(-23 * HOUR) }) }).success).toBe(true)
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: at(-25 * HOUR) }) }).success).toBe(false)
  })

  it('tolerates a client clock a few minutes ahead, not more', () => {
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: at(2 * MINUTE) }) }).success).toBe(true)
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: at(10 * MINUTE) }) }).success).toBe(false)
  })

  it('wants an ISO timestamp, with or without an offset', () => {
    expect(
      checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: '2026-09-24' }) }).success
    ).toBe(false)
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: 'yesterday' }) }).success).toBe(false)
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: Date.now() }) }).success).toBe(false)
    const withOffset = new Date(Date.now() - MINUTE).toISOString().replace('Z', '+00:00')
    expect(checkoutRequestSchema.safeParse({ consent: consent({ acceptedAt: withOffset }) }).success).toBe(true)
  })
})
