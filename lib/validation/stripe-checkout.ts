import { z } from 'zod'
import { isPremiumPlan, type PremiumPlan } from '@/lib/premium-plans'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'

/**
 * The body POST /api/stripe/checkout accepts (#1162).
 *
 * angrerettloven § 19 lets a digital service start inside the 14-day
 * withdrawal period only at the consumer's express request, and § 8 wants the
 * withdrawal information given before the contract. The `consent` object is
 * that request as the page recorded it: which terms and which withdrawal text
 * were on screen, and when the box was ticked. The route puts it on the Stripe
 * session and subscription as the record of the sale.
 */

/**
 * How long a ticked box stays good for. A tab left open overnight still buys;
 * one from last week, or one replayed from an old request, does not.
 */
export const CONSENT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Client clocks run ahead. A consent stamped a few minutes in the future is a
 * skewed clock, not a forgery, and refusing it would block a real purchase.
 */
export const CONSENT_CLOCK_SKEW_MS = 5 * 60 * 1000

/** The `code` the route answers with; the client maps it to premium.consentRequired. */
export const CONSENT_REQUIRED_CODE = 'consent_required'

export const checkoutConsentSchema = z.object({
  // Literal, not string: a consent given against text that has since changed is
  // no consent to the current text.
  termsVersion: z.literal(TERMS_VERSION),
  withdrawalInfoVersion: z.literal(WITHDRAWAL_INFO_VERSION),
  acceptedAt: z
    .string()
    .datetime({ offset: true })
    .refine((value) => {
      const age = Date.now() - new Date(value).getTime()
      return age <= CONSENT_MAX_AGE_MS && age >= -CONSENT_CLOCK_SKEW_MS
    }, 'Consent must have been given within the last 24 hours'),
})

export const checkoutRequestSchema = z.object({
  // The plan keeps the leniency it had before this schema existed (#926): an
  // unknown or missing value is monthly, never an error, so nothing that used
  // to charge the monthly price starts charging something else.
  plan: z.unknown().transform((value): PremiumPlan => (isPremiumPlan(value) ? value : 'monthly')),
  consent: checkoutConsentSchema,
})

export type CheckoutConsent = z.infer<typeof checkoutConsentSchema>
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
