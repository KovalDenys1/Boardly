import type { ErrorEvent } from '@sentry/nextjs'

export const EXTENSION_SCHEMES = [
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
  /^chrome:\/\//i,
]

// AdSense frames reached Sentry as app:///pagead/js/…/rum.js, without the host, so the path is matched too.
export const AD_SCRIPTS = [
  /googlesyndication\.com/i,
  /adtrafficquality\.google/i,
  /\/pagead\/js\//i,
]

/**
 * Third-party noise that is not actionable from our code (#772). Kept narrow
 * on purpose — anything thrown by our own modules must still reach Sentry.
 */
export const THIRD_PARTY_NOISE = [
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

export const DENY_URLS = [...EXTENSION_SCHEMES, ...AD_SCRIPTS]

/**
 * denyUrls only inspects the event's culprit URL; extension and ad-script
 * frames often arrive with the page as culprit, so check the top stack frame too.
 */
export function dropThirdPartyEvent(event: ErrorEvent): ErrorEvent | null {
  const frames = event.exception?.values?.[0]?.stacktrace?.frames
  const filename = frames?.[frames.length - 1]?.filename
  if (filename && DENY_URLS.some((re) => re.test(filename))) {
    return null
  }
  return event
}
