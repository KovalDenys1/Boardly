// This file configures the initialization of Sentry on the client.
// The config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { initBotId } from "botid/client/core";
import { BOTID_PROTECTED_ROUTES } from "./lib/botid-routes";
import { SENTRY_DATA_COLLECTION, stripQueryStrings, stripSpanQueryStrings } from "./lib/sentry-data-collection";
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

  beforeSend: (event) => {
    const kept = dropThirdPartyEvent(event);
    return kept && stripQueryStrings(kept);
  },

  beforeSendTransaction: stripQueryStrings,

  beforeSendSpan: Sentry.withStaticSpan(stripSpanQueryStrings),

  // Only enable Sentry in production or when explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',

  // Adjust sample rates based on environment
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay is intentionally not enabled (#1151): it wrote
  // `sentryReplaySession` to sessionStorage for every visitor before any
  // consent existed (ekomloven § 3-15). Error capture above is unaffected.

  // v11 streams spans by default; keep sending v10's transactions
  traceLifecycle: 'static',

  dataCollection: SENTRY_DATA_COLLECTION,

  // Environment tag
  environment: process.env.NODE_ENV || 'development',
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;