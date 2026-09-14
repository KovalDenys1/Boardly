'use client'

import {
  SIGNUP_SOURCE_COOKIE,
  SIGNUP_SOURCE_COOKIE_MAX_AGE_SECONDS,
  deriveSignupSource,
} from './signup-source'

/**
 * Runs once per browser on first visit: records where the visitor came from
 * into a first-party cookie so the server can attribute the account later.
 * Idempotent — an existing cookie is never overwritten, so the *first* touch wins.
 */
export function captureSignupSource(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  try {
    if (document.cookie.split('; ').some((c) => c.startsWith(`${SIGNUP_SOURCE_COOKIE}=`))) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const value = deriveSignupSource({
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      referrer: document.referrer,
      currentHostname: window.location.hostname,
    })

    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${SIGNUP_SOURCE_COOKIE}=${encodeURIComponent(value)}; Max-Age=${SIGNUP_SOURCE_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`
  } catch {
    // Cookies blocked (privacy mode, embedded WebView) — attribution is best-effort.
  }
}
