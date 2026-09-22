'use client'

import {
  SIGNUP_SOURCE_HEADER,
  SIGNUP_SOURCE_PARAM,
  deriveSignupSource,
  sanitizeSignupSource,
} from './signup-source'

/**
 * First-touch attribution for this page load, held in memory only.
 *
 * Deliberately a module variable and not a cookie or localStorage entry: see the note in
 * `signup-source.ts` (#1067). It lives as long as the tab's JS context and is read by
 * `signupSourceHeaders()` when an account-creating request goes out.
 */
let cached: string | null = null

/**
 * Derives the source from the current URL and referrer. Idempotent and lazy — the first
 * caller wins and every later call gets the same value.
 *
 * Lazy on purpose: React runs a parent's effect *after* its children's, so an eager capture
 * in a top-level provider can lose to a child effect that already fired the request which
 * mints the guest. Computing on first read removes that ordering question entirely — both
 * `location.search` and `document.referrer` are stable for the whole document, including
 * across client-side navigations.
 */
export function captureSignupSource(): string | null {
  if (cached !== null) return cached
  if (typeof window === 'undefined' || typeof document === 'undefined') return null

  try {
    const params = new URLSearchParams(window.location.search)
    cached = deriveSignupSource({
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      referrer: document.referrer,
      currentHostname: window.location.hostname,
    })
  } catch {
    // Nothing here can realistically throw, but attribution is never worth a broken page.
    cached = null
  }

  return cached
}

/** Header to merge into any request that may create an account. */
export function signupSourceHeaders(): Record<string, string> {
  const value = captureSignupSource()
  return value ? { [SIGNUP_SOURCE_HEADER]: value } : {}
}

/**
 * Appends the source to an OAuth `callbackUrl`.
 *
 * The redirect to the provider destroys the page, so the header cannot be used. The value
 * is an acquisition channel (`ref:reddit.com`, `utm:...`) and never personal data, so
 * carrying it in our own same-origin URL is fine.
 */
export function withSignupSourceParam(callbackUrl: string): string {
  const value = captureSignupSource()
  if (!value) return callbackUrl

  try {
    const url = new URL(callbackUrl, window.location.origin)
    url.searchParams.set(SIGNUP_SOURCE_PARAM, value)
    // Keep it relative when it started relative, so NextAuth's same-origin check is trivial.
    return callbackUrl.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`
  } catch {
    return callbackUrl
  }
}

/**
 * Reads the value back after an OAuth round-trip and clears it from the address bar, so a
 * shared or bookmarked URL does not carry someone else's attribution.
 */
export function takeSignupSourceParam(): string | null {
  if (typeof window === 'undefined') return null

  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get(SIGNUP_SOURCE_PARAM)
    if (!raw) return null

    url.searchParams.delete(SIGNUP_SOURCE_PARAM)
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    return sanitizeSignupSource(raw)
  } catch {
    return null
  }
}
