// Entity nodes for /premium (#926), kept out of page.tsx so their shape can be
// unit-tested without rendering the page – the same split /about uses.
//
// The Offer nodes are built from the Stripe prices the page was handed, not
// from anything written here: an Offer with a price Stripe would not charge is
// a rich-result violation as well as a lie, so a plan that did not resolve
// contributes no Offer at all.

import { BOARDLY_URL } from '@/lib/organization-json-ld'
import { majorUnitAmount, type PremiumPlanPrice, type PremiumPricing } from '@/lib/premium-plans'

export { BOARDLY_URL, ORGANIZATION_ID } from '@/lib/organization-json-ld'
export const PREMIUM_URL = `${BOARDLY_URL}/premium`

export const PREMIUM_TITLE = 'Boardly Premium – Subscription Plans and Pricing'

export const PREMIUM_DESCRIPTION =
  'Boardly Premium is the optional subscription for boardly.online: custom avatar uploads, a gold name and crown in every lobby, profile card styles, an accent colour, a featured game, custom lobby themes and spectators. Monthly or yearly, cancel anytime, every game stays free.'

export const PREMIUM_IMAGE_URL = `${BOARDLY_URL}/og/premium`

// Google's merchant listings want a return and a shipping policy on every
// Offer, up to 50 countries each; a subscription is delivered online at once.
const LISTING_COUNTRIES = ['NO', 'SE', 'DK', 'FI', 'DE', 'GB', 'US', 'CA', 'UA', 'PL']

function offerNode(price: PremiumPlanPrice) {
  const currency = price.currency.toUpperCase()
  return {
    '@type': 'Offer',
    name: price.plan === 'yearly' ? 'Boardly Premium, yearly' : 'Boardly Premium, monthly',
    price: String(majorUnitAmount(price.unitAmount, price.currency)),
    priceCurrency: currency,
    url: PREMIUM_URL,
    availability: 'https://schema.org/InStock',
    category: price.plan === 'yearly' ? 'Annual subscription' : 'Monthly subscription',
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: LISTING_COUNTRIES,
      returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
    },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: 0, currency },
      shippingDestination: LISTING_COUNTRIES.map((addressCountry) => ({ '@type': 'DefinedRegion', addressCountry })),
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
        transitTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 0, unitCode: 'DAY' },
      },
    },
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
    image: [PREMIUM_IMAGE_URL],
    brand: { '@type': 'Brand', name: 'Boardly' },
    ...(offers.length > 0 ? { offers } : {}),
  }
}
