// This file configures the initialization of Sentry on the client.
// The config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable Sentry in production or when explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',

  // Adjust sample rates based on environment
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0.5,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: process.env.NODE_ENV === 'production',
      blockAllMedia: process.env.NODE_ENV === 'production',
    }),
  ],

  // Don't send PII in production for privacy
  sendDefaultPii: process.env.NODE_ENV !== 'production',

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Environment tag
  environment: process.env.NODE_ENV || 'development',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;