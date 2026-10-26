import type { Metadata } from 'next'
import AboutContent from './AboutContent'
import { ABOUT_DESCRIPTION, ABOUT_URL, aboutPageJsonLd, organizationJsonLd } from './about-json-ld'
import { OG_SITE_DEFAULTS, socialImages } from '@/lib/social-preview'

export const metadata: Metadata = {
  // absolute: the layout template would append "| Boardly" a second time.
  title: { absolute: 'About Boardly – Free Online Board Games with Friends' },
  description: ABOUT_DESCRIPTION,
  openGraph: {
    ...OG_SITE_DEFAULTS,
    images: socialImages('about'),
    title: 'About Boardly',
    description: ABOUT_DESCRIPTION,
    url: ABOUT_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    images: socialImages('about'),
    title: 'About Boardly',
    description: ABOUT_DESCRIPTION,
  },
  alternates: {
    canonical: 'https://boardly.online/about',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function AboutPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutPageJsonLd) }} />
      <AboutContent />
    </>
  )
}
