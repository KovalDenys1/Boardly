import './globals.css'
import type { Metadata, Viewport } from 'next'
import Providers from './providers'
import dynamic from 'next/dynamic'
import { getThemeInitScript } from '@/lib/theme'
import { Bricolage_Grotesque, Inter } from 'next/font/google'

const bricolageFont = Bricolage_Grotesque({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--bd-font-display',
  display: 'swap',
})

const interFont = Inter({
  subsets: ['latin'],
  display: 'swap',
})

const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), {
  loading: () => null,
})

const DeferredTelemetry = dynamic(() => import('@/components/DeferredTelemetry'), {
  loading: () => null,
})

// Header Skeleton with fixed dimensions to prevent CLS
function HeaderSkeleton() {
  return (
    <header className="site-header sticky top-0 z-50" style={{ height: '64px', minHeight: '64px', background: '#FBF6EE', borderBottom: '1.5px solid #E8DDC8' }}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" style={{ height: '100%' }}>
        <div className="flex justify-between items-center" style={{ height: '100%' }}>
          <div className="flex items-center gap-2" style={{ minWidth: '120px', fontFamily: "'Bricolage Grotesque', Georgia, serif", fontWeight: 800, fontSize: 22, color: '#1F1B16' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: '#1F1B16', color: '#FFC44D', display: 'grid', placeItems: 'center', fontSize: 20, transform: 'rotate(-6deg)', boxShadow: '3px 3px 0 #FF6B5B', flexShrink: 0 }}>B</span>
            boardly
          </div>
          <div className="flex items-center gap-4" style={{ minWidth: '200px' }}>
            <div className="w-20 h-8 rounded-xl animate-pulse" style={{ background: '#E8DDC8' }}></div>
            <div className="w-24 h-10 rounded-xl animate-pulse" style={{ background: '#1F1B16', opacity: 0.15 }}></div>
          </div>
        </div>
      </nav>
    </header>
  )
}

const Header = dynamic(() => import('@/components/Header'), {
  loading: () => <HeaderSkeleton />,
})

export const metadata: Metadata = {
  metadataBase: new URL('https://boardly.online'),
  title: {
    default: 'Boardly - Free Online Board Games with Friends',
    template: '%s | Boardly'
  },
  description: 'Play free online board games and tabletop-style games with friends in real time. Join Yahtzee, Tic Tac Toe, Memory, Guess the Spy and more. No download required.',
  keywords: ['free online board games', 'online board games with friends', 'multiplayer board games', 'tabletop games online', 'browser games', 'yahtzee online', 'tic tac toe online', 'memory game online', 'boardly'],
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
    url: 'https://boardly.online',
    title: 'Boardly - Free Online Board Games with Friends',
    description: 'Play free online board games and tabletop-style games with friends in real time. No download required.',
    siteName: 'Boardly',
    // Images are auto-generated from opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Boardly - Free Online Board Games with Friends',
    description: 'Play free online board games with friends in real time. No download required.',
    // Images are auto-generated from twitter-image.tsx
    creator: '@boardly',
  },
  alternates: {
    canonical: '/',
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
    google: '4IgITqkIlvPBjp9SVRkOkHz0sbcd0sXdvkFu1pBkQFs',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: 'cover',
  userScalable: true,
  themeColor: '#1F1B16',
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
    description: 'Play free online board games and tabletop-style games with friends in real time.',
    url: 'https://boardly.online',
    publisher: {
      '@type': 'Organization',
      name: 'Boardly',
      url: 'https://boardly.online',
      logo: {
        '@type': 'ImageObject',
        url: 'https://boardly.online/icons/icon-512.png'
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
    <html lang="en" suppressHydrationWarning className={`${bricolageFont.variable} ${interFont.className}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Boardly" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icons/icon-192.svg" sizes="192x192" type="image/svg+xml" />
        <link rel="icon" href="/icons/icon-512.svg" sizes="512x512" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="mask-icon" href="/icons/icon-maskable-512.svg" color="#1F1B16" />
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
            __html: 'body{margin:0;background:#FBF6EE}.site-header{min-height:64px;height:64px;background:#FBF6EE;border-bottom:1.5px solid #E8DDC8}*{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}@supports(height:100dvh){html,body{height:100dvh}}'
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
          <Header />
          <main>{children}</main>
          <FeedbackWidget />
        </Providers>
        {isProduction && <DeferredTelemetry />}
      </body>
    </html>
  )
}
