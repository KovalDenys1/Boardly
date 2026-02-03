import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Providers from './providers'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'

// Header Skeleton with fixed dimensions to prevent CLS
function HeaderSkeleton() {
  return (
    <header className="bg-gradient-to-r from-blue-600 to-purple-600 shadow-lg sticky top-0 z-50" style={{ height: '64px', minHeight: '64px' }}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ height: '100%' }}>
        <div className="flex justify-between items-center" style={{ height: '100%' }}>
          <div className="flex items-center gap-2 text-2xl font-bold text-white" style={{ minWidth: '120px' }}>
            🎲 Boardly
          </div>
          <div className="flex items-center gap-4" style={{ minWidth: '200px' }}>
            <div className="w-20 h-8 bg-white/20 rounded animate-pulse"></div>
            <div className="w-24 h-10 bg-white/20 rounded-lg animate-pulse"></div>
          </div>
        </div>
      </nav>
    </header>
  )
}

// Import Header with SSR for better FCP, but handle i18n client-side
const Header = dynamic(() => import('@/components/Header'), {
  ssr: true, // Enable SSR for better FCP
  loading: () => <HeaderSkeleton />
})

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  preload: true,
  variable: '--font-inter',
  // Optimize font loading for better FCP
  fallback: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
  adjustFontFallback: true,
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
        {/* Mobile viewport configuration with safe area support */}
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, viewport-fit=cover, user-scalable=yes" 
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        {/* Preconnect to external domains - moved before font loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {isProduction && (
          <>
            <link rel="dns-prefetch" href="https://vitals.vercel-insights.com" />
            <link rel="dns-prefetch" href="https://va.vercel-scripts.com" />
          </>
        )}
        
        {/* Critical CSS inline for faster FCP */}
        <style dangerouslySetInnerHTML={{
          __html: `
            html { font-family: ${inter.style.fontFamily}; }
            body { margin: 0; }
            /* Prevent layout shift for header */
            header { min-height: 64px; height: 64px; }
            /* Optimize font rendering */
            * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
            /* Mobile viewport height fix */
            @supports (height: 100dvh) {
              html, body { height: 100dvh; }
            }
          `
        }} />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <Suspense fallback={<HeaderSkeleton />}>
            <Header />
          </Suspense>
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
