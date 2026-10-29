// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";
import { SENTRY_DATA_COLLECTION, stripQueryStrings, stripSpanQueryStrings } from "./lib/sentry-data-collection";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable Sentry in production or when explicitly enabled
  enabled: process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true',

  // Adjust sample rate based on environment
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // v11 streams spans by default; keep sending v10's transactions
  traceLifecycle: 'static',

  dataCollection: SENTRY_DATA_COLLECTION,

  beforeSend: stripQueryStrings,

  beforeSendTransaction: stripQueryStrings,

  beforeSendSpan: Sentry.withStaticSpan(stripSpanQueryStrings),

  // Environment tag
  environment: process.env.NODE_ENV || 'development',
});
