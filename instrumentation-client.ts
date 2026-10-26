// This file configures the initialization of Sentry on the client.
// The config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";
import { BOTID_PROTECTED_ROUTES } from "./lib/botid-routes";
import { DENY_URLS, THIRD_PARTY_NOISE, dropThirdPartyEvent } from "./lib/sentry-noise";

// Vercel BotID (#1157): attaches the invisible challenge to the fetches that mint an account
// or a guest. Here rather than in a layout, as https://vercel.com/docs/botid/get-started
// recommends for Next.js 15.3+, so no page - the statically prerendered guides included -
// has to become dynamic to carry it. The server half is lib/bot-protection.ts.
initBotId({ protect: BOTID_PROTECTED_ROUTES });

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  ignoreErrors: THIRD_PARTY_NOISE,

  denyUrls: DENY_URLS,

  beforeSend: dropThirdPartyEvent,

  // Only enable Sentry in production or when explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',

  // Adjust sample rates based on environment
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay is intentionally not enabled (#1151): it wrote
  // `sentryReplaySession` to sessionStorage for every visitor before any
  // consent existed (ekomloven § 3-15). Error capture above is unaffected.

  // Don't send PII in production for privacy
  sendDefaultPii: process.env.NODE_ENV !== 'production',

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Environment tag
  environment: process.env.NODE_ENV || 'development',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;