import type { Metadata } from 'next'
import HomePageView from '@/components/HomePage/HomePageView'
import { languageAlternates } from '@/lib/seo-locales'

export const metadata: Metadata = {
  alternates: { canonical: '/', languages: languageAlternates('/') },
}

// Keep home page fully static for fast global TTFB.
export const dynamic = 'force-static'
export const revalidate = 3600

export default function HomePage() {
  return <HomePageView locale="en" />
}
