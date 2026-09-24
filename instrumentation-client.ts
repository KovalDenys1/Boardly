// This file configures the initialization of Sentry on the client.
// The config here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const EXTENSION_SCHEMES = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
  /^chrome:\/\//i,
]

/**
 * Third-party noise that is not actionable from our code (#772). Kept narrow
 * on purpose — anything thrown by our own modules must still reach Sentry.
 */
const THIRD_PARTY_NOISE = [
  // Google Translate (and other DOM-rewriting extensions) swap React's text
  // nodes, so React's later removeChild/insertBefore of the original node
  // throws. We also mark dynamic surfaces translate="no" to reduce these.
  /Failed to execute 'removeChild' on 'Node'/,
  /Failed to execute 'insertBefore' on 'Node'/,
  /The object can not be found here/,
  // Crypto wallet extensions injected into the page
  /Failed to connect to MetaMask/,
  // Android WebView host tears down its bridge while the page is still alive
  /Java object is gone/,
  // Outlook SafeLinks / mail scanners crawling shared lobby links
  /Object Not Found Matching Id/,
  // Benign browser layout notification, never actionable
  /ResizeObserver loop/,
]

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  ignoreErrors: THIRD_PARTY_NOISE,

  // Errors whose script origin is a browser extension are never ours
  denyUrls: EXTENSION_SCHEMES,

  beforeSend(event) {
    // denyUrls only inspects the event's culprit URL; extension frames often
    // arrive with the page as culprit, so check the top stack frame too.
    const frames = event.exception?.values?.[0]?.stacktrace?.frames
    const topFrame = frames?.[frames.length - 1]
    if (topFrame?.filename && EXTENSION_SCHEMES.some((re) => re.test(topFrame.filename!))) {
      return null
    }
    return event
  },

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