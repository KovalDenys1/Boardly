/**
 * Premium is sold through Stripe Managed Payments (#1179): Stripe's affiliate
 * Sold through Link, LLC is the merchant of record, and the buyer's receipts,
 * invoices, refund notices and payment support come from Link. These are the
 * two pages of Link's that /terms, /withdrawal and the purchase confirmation
 * point a buyer at.
 *
 * What the site says about them is quoted from those pages as read on
 * 2026-09-24, and from https://stripe.com/legal/managed-payments:
 * - "If you are a consumer under EU law, you have a right to cancel your Order
 *   during the cooling off period. The cooling off period is for 14 days ...
 *   To exercise this right, contact Customer Support and follow the
 *   instructions for requesting a refund and include "cooling off period" as
 *   the basis for your refund request." The UK row says the same; Norway, an
 *   EEA state outside the EU, is not named, which is why our own 14-day full
 *   refund stays the promise the site makes.
 * - "Unless required by Law, we do not provide refunds for unused subscription
 *   periods", so the yearly plan's refund of unused months is always ours to
 *   issue.
 */

/** Link support for "Sold through Link" purchases: refunds, charges, subscriptions. */
export const LINK_SUPPORT_URL = 'https://support.link.com/topics/sold-through-link'

/** Link's Sold Through Link Terms, which apply to the buyer's order. */
export const LINK_TERMS_URL = 'https://link.com/terms#sold-through-link-terms'
