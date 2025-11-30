import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Providers from './providers'
import Header from '@/components/Header'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.boardly.online'),
  title: {
    default: 'Boardly - Play Board Games Online with Friends',
    template: '%s | Boardly'
  },
  description: 'Play popular board games online with friends in real-time. Join Yahtzee and more multiplayer games. Free, no download required. Create lobbies, invite friends, and start playing instantly!',
  keywords: ['board games', 'online games', 'multiplayer games', 'yahtzee online', 'play with friends', 'browser games', 'free online games', 'real-time games', 'boardly'],
  authors: [{ name: 'Boardly' }],
  creator: 'Boardly',
  publisher: 'Boardly',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://www.boardly.online',
    title: 'Boardly - Play Board Games Online with Friends',
    description: 'Play popular board games online with friends in real-time. Join Yahtzee and more multiplayer games. Free, no download required.',
    siteName: 'Boardly',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Boardly - Online Board Games',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boardly - Play Board Games Online with Friends',
    description: 'Play popular board games online with friends in real-time. Free, no download required.',
    images: ['/og-image.png'],
    creator: '@boardly',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
    yandex: 'your-yandex-verification-code',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Boardly',
    description: 'Play popular board games online with friends in real-time',
    url: 'https://www.boardly.online',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://www.boardly.online/lobby?search={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Boardly',
      url: 'https://www.boardly.online',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.boardly.online/logo.png'
      }
    }
  }

  const isProduction = process.env.NODE_ENV === 'production'

  return (
    <html lang="en">
      <head>
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {isProduction && (
          <>
            <link rel="preconnect" href="https://vitals.vercel-insights.com" />
            <link rel="preconnect" href="https://va.vercel-scripts.com" />
          </>
        )}
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <Header />
          <main>{children}</main>
        </Providers>
        {isProduction && (
          <>
            <SpeedInsights />
            <Analytics />
          </>
        )}
      </body>
    </html>
  )
}
