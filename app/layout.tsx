import './globals.css'
import type { Metadata } from 'next'
import Providers from './providers'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/react'
import { getThemeInitScript } from '@/lib/theme'

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
  const themeInitScript = getThemeInitScript()
  const devServiceWorkerResetScript = !isProduction
    ? `(() => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const reloadKey = '__boardly_dev_sw_reset__';

  const reset = async () => {
    let changed = false;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) {
        await Promise.all(registrations.map((registration) => registration.unregister()));
        changed = true;
      }
    } catch {}

    try {
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        const boardlyCacheKeys = cacheKeys.filter((key) => key.startsWith('boardly-pwa-'));
        if (boardlyCacheKeys.length > 0) {
          await Promise.all(boardlyCacheKeys.map((key) => caches.delete(key)));
          changed = true;
        }
      }
    } catch {}

    if (!changed) {
      window.sessionStorage.removeItem(reloadKey);
      return;
    }

    if (window.sessionStorage.getItem(reloadKey) === '1') {
      window.sessionStorage.removeItem(reloadKey);
      return;
    }

    window.sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  };

  void reset();
})();`
    : null

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
        <meta name="apple-mobile-web-app-title" content="Boardly" />
        <meta name="theme-color" content="#2563eb" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/icon-192.png" sizes="192x192" type="image/png" />
        <link rel="icon" href="/icons/icon-512.png" sizes="512x512" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="mask-icon" href="/icons/icon-maskable-512.svg" color="#2563eb" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-640x1136.png" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1242x2688.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1284x2778.png" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1536x2048.png" media="(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668x2224.png" media="(device-width: 834px) and (device-height: 1112px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-1668x2388.png" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />
        <link rel="apple-touch-startup-image" href="/splash/apple-splash-2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" />

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
        <style 
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: 'body{margin:0}header{min-height:64px;height:64px}*{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}@supports(height:100dvh){html,body{height:100dvh}}'
          }} 
        />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {devServiceWorkerResetScript && (
          <script
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: devServiceWorkerResetScript }}
          />
        )}
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
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
