import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Providers from './providers'
import dynamic from 'next/dynamic'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'

// Import Header without SSR to avoid hydration issues with i18n
const Header = dynamic(() => import('@/components/Header'), {
  ssr: false,
  loading: () => (
    <header className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex items-center gap-2 text-2xl font-bold text-white">
              🎲 Boardly
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
})

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
    // Images are auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boardly - Play Board Games Online with Friends',
    description: 'Play popular board games online with friends in real-time. Free, no download required.',
    // Images are auto-generated from twitter-image.tsx
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
