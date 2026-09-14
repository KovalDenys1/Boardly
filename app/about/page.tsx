import type { Metadata } from 'next'
import AboutContent from './AboutContent'
import { ABOUT_DESCRIPTION, ABOUT_URL, aboutPageJsonLd, organizationJsonLd } from './about-json-ld'

export const metadata: Metadata = {
  title: 'About Boardly – Free Online Board Games with Friends',
  description: ABOUT_DESCRIPTION,
  openGraph: {
    title: 'About Boardly',
    description: ABOUT_DESCRIPTION,
    url: ABOUT_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Boardly',
    description: ABOUT_DESCRIPTION,
  },
  alternates: {
    canonical: ABOUT_URL,
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
