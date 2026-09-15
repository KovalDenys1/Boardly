import type { Metadata } from 'next'
import PremiumContent from './PremiumContent'
import { getPremiumPricing } from '@/lib/server/premium-pricing'
import { PREMIUM_DESCRIPTION, PREMIUM_TITLE, PREMIUM_URL, premiumProductJsonLd } from './premium-json-ld'

export const metadata: Metadata = {
  // absolute: the layout template would append "| Boardly" a second time.
  title: { absolute: PREMIUM_TITLE },
  description: PREMIUM_DESCRIPTION,
  openGraph: {
    title: 'Boardly Premium',
    description: PREMIUM_DESCRIPTION,
    url: PREMIUM_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boardly Premium',
    description: PREMIUM_DESCRIPTION,
  },
  alternates: {
    canonical: 'https://boardly.online/premium',
  },
  robots: {
    index: true,
    follow: true,
  },
}

/**
 * The prices come off Stripe, so the page is regenerated rather than frozen at
 * build time: a change in the Stripe dashboard reaches visitors without a
 * deploy, and nobody waits on a Stripe round trip during their own request. The
 * hour is a ceiling and matches app/page.tsx – the build already regenerates
 * every prerendered route more often than that.
 */
export const revalidate = 3600

export default async function PremiumPage() {
  const pricing = await getPremiumPricing()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(premiumProductJsonLd(pricing)) }}
      />
      <PremiumContent pricing={pricing} />
    </>
  )
}
