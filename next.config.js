const { withSentryConfig } = require("@sentry/nextjs")
const path = require("path")

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
    optimizePackageImports: ['react-hot-toast', 'next-auth'],
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
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Organization and project (from Sentry dashboard)
  org: process.env.SENTRY_ORG || "boardly-v6",
  project: process.env.SENTRY_PROJECT || "javascript-nextjs",

  // Auth token for uploading source maps (optional - set SENTRY_AUTH_TOKEN in .env.local)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js proxy, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  webpack: {
    // Automatically tree-shake Sentry logger statements to reduce bundle size.
    treeshake: {
      removeDebugLogging: true,
    },

    automaticVercelMonitors: true,
  },
  
  // Disable telemetry to reduce noise in logs
  telemetry: false,
}

// Sentry webpack plugin is only needed for production builds.
// Keeping it disabled in local development avoids flaky `.next` manifest lookups
// (e.g. edge-instrumentation/routes-manifest ENOENT) during hot reload.
module.exports =
  process.env.NODE_ENV === 'production'
    ? withSentryConfig(nextConfig, sentryWebpackOptions)
    : nextConfig
