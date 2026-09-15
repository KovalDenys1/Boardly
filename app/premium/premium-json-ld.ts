// Entity nodes for /premium (#926), kept out of page.tsx so their shape can be
// unit-tested without rendering the page – the same split /about uses.
//
// The Offer nodes are built from the Stripe prices the page was handed, not
// from anything written here: an Offer with a price Stripe would not charge is
// a rich-result violation as well as a lie, so a plan that did not resolve
// contributes no Offer at all.

import { BOARDLY_URL, ORGANIZATION_ID } from '@/lib/organization-json-ld'
import { majorUnitAmount, type PremiumPlanPrice, type PremiumPricing } from '@/lib/premium-plans'

export { BOARDLY_URL, ORGANIZATION_ID } from '@/lib/organization-json-ld'
export const PREMIUM_URL = `${BOARDLY_URL}/premium`

export const PREMIUM_TITLE = 'Boardly Premium – Subscription Plans and Pricing'

export const PREMIUM_DESCRIPTION =
  'Boardly Premium is the optional subscription for boardly.online: custom avatar uploads, a gold name and crown in every lobby, profile card styles, an accent colour, a featured game, custom lobby themes and spectators. Monthly or yearly, cancel anytime, every game stays free.'

function offerNode(price: PremiumPlanPrice) {
  return {
    '@type': 'Offer',
    name: price.plan === 'yearly' ? 'Boardly Premium, yearly' : 'Boardly Premium, monthly',
    price: String(majorUnitAmount(price.unitAmount, price.currency)),
    priceCurrency: price.currency.toUpperCase(),
    url: PREMIUM_URL,
    availability: 'https://schema.org/InStock',
    category: price.plan === 'yearly' ? 'Annual subscription' : 'Monthly subscription',
  }
}

export function premiumProductJsonLd(pricing: PremiumPricing) {
  const offers = [pricing.monthly, pricing.yearly]
    .filter((price): price is PremiumPlanPrice => price !== null)
    .map(offerNode)

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Boardly Premium',
    url: PREMIUM_URL,
    description: PREMIUM_DESCRIPTION,
    brand: { '@id': ORGANIZATION_ID },
    ...(offers.length > 0 ? { offers } : {}),
  }
}
