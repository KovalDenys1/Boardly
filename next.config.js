const { withSentryConfig } = require("@sentry/nextjs")
const path = require("path")
const { socialShortLinkRedirects } = require("./lib/social-short-links")

const envDevOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((origin) => {
    try {
      return new URL(origin).hostname
    } catch {
      return origin
        .replace(/^https?:\/\//, '')
        .replace(/^wss?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
    }
  })

const allowedDevOrigins = Array.from(new Set([
  'localhost',
  '127.0.0.1',
  ...envDevOrigins,
]))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.boardly.online' }],
        destination: 'https://boardly.online/:path*',
        permanent: true,
      },
      // Guides merged away by #923. All three were indexed URLs, so each one
      // keeps working as a 301 onto the page that now answers its query.
      // `__tests__/app/guides-pruning.test.ts` holds this list to the catalog:
      // a slug may not be both redirected and listed, and a removed slug may
      // not be linked from anywhere in the app.
      {
        // A four-entry copy of the catalog page, which outranks it 958
        // impressions to 19 (GSC, 5 Jun – 4 Sep 2026). Same intent, so the
        // guide was only splitting the signal.
        source: '/guides/best-free-multiplayer-browser-games',
        destination: '/games',
        permanent: true,
      },
      {
        // Yahtzee, Memory and Guess the Spy – a strict subset of the game
        // night list, which now covers group size explicitly.
        source: '/guides/best-3-player-games-online',
        destination: '/guides/best-online-games-for-game-night',
        permanent: true,
      },
      {
        // Guess the Spy, Alias and Yahtzee for a group: the same three games
        // and the same audience as game night, under a second name.
        source: '/guides/best-party-games-online',
        destination: '/guides/best-online-games-for-game-night',
        permanent: true,
      },
      // Folded into the game page by #1077 (SEO Track A). Search Console
      // listed it under "Crawled – currently not indexed" (Page indexing,
      // read 2026-09-21): Google fetched it and declined it on content, and it
      // earned no impressions. Its strategy now lives at /games/yahtzee#strategy,
      // on the page that carries the Yahtzee impressions. A redirect cannot
      // carry the fragment reliably, and the guides-pruning test reads the
      // destination as a page path, so it lands on the page itself.
      {
        source: '/guides/yahtzee-strategy-guide',
        destination: '/games/yahtzee',
        permanent: true,
      },
      // Folded into the game page by #1090 (SEO Track A, game two), on the
      // same evidence as the Yahtzee guide above: Search Console listed it
      // under "Crawled – currently not indexed" (read 2026-09-24) and it
      // earned no impressions. Its strategy now lives at
      // /games/connect-four#strategy; the redirect lands on the page itself
      // for the same reason as above.
      {
        source: '/guides/connect-four-strategy-guide',
        destination: '/games/connect-four',
        permanent: true,
      },
      // Typeable links for social posts (#1096): /tt, /ig, /yt, /fb, /th,
      // /pin, /x -> the home page with UTM. 307, so they can be retargeted.
      ...socialShortLinkRedirects(),
    ]
  },
  // Allow local host variants in development to prevent HMR/CORS failures
  // when opening the app via localhost, 127.0.0.1, or LAN IP.
  allowedDevOrigins,
  
  // Performance optimizations
  poweredByHeader: false,
  compress: true,
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['react-hot-toast', 'next-auth', '@phosphor-icons/react'],
    // Note: optimizeCss requires critters package, disabled to avoid build issues
    // optimizeCss: true,
  },
  
  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Output configuration for better caching
  output: 'standalone',
  
  // Turbopack alias (used by `next dev` in Next.js 15+)
  // Bypasses use-sync-external-store/shim's process.env.NODE_ENV conditional
  // which causes React Refresh HMR to register an undefined module factory.
  turbopack: {
    resolveAlias: {
      'use-sync-external-store/shim': './lib/shims/use-sync-external-store-shim.js',
    },
  },

  webpack: (config) => {
    // Same alias for webpack (used by `next build` and older Next.js dev).
    config.resolve.alias['use-sync-external-store/shim'] =
      path.resolve(__dirname, 'lib/shims/use-sync-external-store-shim.js')

    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    })
    
    return config
  },
}

const sentryWebpackOptions = {
  org: process.env.SENTRY_ORG || "boardly-v6",
  project: process.env.SENTRY_PROJECT || "javascript-nextjs",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  telemetry: false,

  // Strip sourceMappingURL comments from client bundles and delete .map files
  // after uploading to Sentry (v10 API — replaces hideSourceMaps + widenClientFileUpload)
  hideSourceMaps: true,
  sourcemaps: {
    deleteFilesAfterUpload: ['**/*.js.map', '**/*.css.map'],
  },

  automaticVercelMonitors: true,
}

// The VAPID public key is inlined into the client bundle at build time, so a
// production build without it ships a push opt-in that can never subscribe
// anyone — and nothing at runtime can put that right (#983).
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
  console.warn('WARN NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set — Web Push is disabled in this build')
}

// Sentry webpack plugin is only needed for production builds.
// Keeping it disabled in local development avoids flaky `.next` manifest lookups
// (e.g. edge-instrumentation/routes-manifest ENOENT) during hot reload.
module.exports =
  process.env.NODE_ENV === 'production'
    ? withSentryConfig(nextConfig, sentryWebpackOptions)
    : nextConfig
