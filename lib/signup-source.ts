/**
 * Acquisition-source attribution.
 *
 * The client derives where a visitor came from (UTM params or the referrer hostname) on
 * first read and keeps it in memory for the lifetime of the page. It rides along on the
 * request that creates the account, in the `X-Signup-Source` header, and the server copies
 * it onto `Users.signupSource` (guest, e-mail registration, or OAuth).
 *
 * **Nothing is stored on the visitor's device.** This used to be a 90-day `bd_src` cookie,
 * written unconditionally by the proxy and by the client. Attribution is not strictly
 * necessary for the service, so under ePrivacy Art. 5(3) that cookie needed consent before
 * it was written, and it had none — the Google CMP that ships with the AdSense loader turns
 * out to display nothing and produce no TC string while ads are off, so there was also no
 * consent signal to gate it on (#1067, verified against production 2026-09-22). A header
 * carrying an in-memory value is not terminal-equipment storage, so the question does not
 * arise and no cookie banner is needed.
 *
 * The OAuth path cannot use the header: the redirect to Google throws the page away. There
 * the value travels in the `callbackUrl` query instead and is written back afterwards by
 * POST /api/auth/attribution, first-touch-wins (only when `signupSource` is still null).
 *
 * Value shapes: `utm:<source>[/<medium>[/<campaign>]]`, `ref:<hostname>`, `direct`.
 *
 * Precedence (#1091): UTM, then an external referrer, then the social app whose in-app
 * browser this is, then a platform click id, then `direct`. Social hosts are folded to one
 * per platform by `canonicalReferrerHost` (`l.instagram.com` → `instagram.com`, `t.co` →
 * `x.com`), and the two fallbacks produce the same `ref:<platform host>` value, so the
 * Control Panel's parser reads them without change.
 *
 * The campaign is kept because without it two posts on the same platform are the same row,
 * and the Revenue Plan's way of testing a channel is to run it for three weeks and compare.
 */

/** Carries the in-memory value on the request that creates the account. */
import {
  canonicalReferrerHost,
  detectInAppBrowser,
  hostFromClickIds,
  inAppBrowserHost,
} from './social-referrers'

export const SIGNUP_SOURCE_HEADER = 'X-Signup-Source'
/** Carries it across an OAuth redirect, where no page survives to send a header. */
export const SIGNUP_SOURCE_PARAM = 'bd_src'
export const SIGNUP_SOURCE_MAX_LENGTH = 120
/**
 * `utm_medium` on the link the in-app-browser notice copies (#1091). Paired with a
 * `utm_source` that is a host, it means "this is `ref:<host>` carried across to the
 * system browser", and is read back as exactly that, not as a new `utm:` bucket.
 */
export const IN_APP_HANDOFF_MEDIUM = 'inapp'

const SAFE_CHARS = /[^a-z0-9._:\/-]/g

/** Lower-cases, strips anything outside a conservative charset, caps the length. */
export function sanitizeSignupSource(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().toLowerCase().replace(SAFE_CHARS, '')
  if (!cleaned) return null
  return cleaned.slice(0, SIGNUP_SOURCE_MAX_LENGTH)
}

/** Builds the stored value from what the browser knows on first visit. */
export function deriveSignupSource(input: {
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  referrer?: string | null
  currentHostname?: string | null
  /** `navigator.userAgent`, to recognise an Instagram/Facebook/TikTok in-app browser. */
  userAgent?: string | null
  /** `location.search`, for the platforms' click ids (`fbclid`, `ttclid`, `igshid`). */
  search?: string | null
}): string {
  const utmSource = sanitizeSignupSource(input.utmSource)
  const utmMediumRaw = sanitizeSignupSource(input.utmMedium)
  if (utmSource && utmMediumRaw === IN_APP_HANDOFF_MEDIUM && utmSource.includes('.')) {
    const host = canonicalReferrerHost(utmSource)
    if (host) return sanitizeSignupSource(`ref:${host}`) ?? 'direct'
  }
  if (utmSource) {
    const utmMedium = sanitizeSignupSource(input.utmMedium)
    const utmCampaign = sanitizeSignupSource(input.utmCampaign)
    // A campaign without a medium would make `utm:reddit/launch` ambiguous with a medium,
    // so an empty medium is held open with a `-` rather than collapsed.
    const tail = utmCampaign
      ? `/${utmMedium || '-'}/${utmCampaign}`
      : utmMedium
        ? `/${utmMedium}`
        : ''
    return sanitizeSignupSource(`utm:${utmSource}${tail}`) ?? 'direct'
  }

  if (input.referrer) {
    try {
      const host = canonicalReferrerHost(new URL(input.referrer).hostname)
      const own = canonicalReferrerHost(input.currentHostname)
      if (host && host !== own) {
        return sanitizeSignupSource(`ref:${host}`) ?? 'direct'
      }
    } catch {
      // malformed referrer — fall through to the in-app and click-id signals
    }
  }

  // In-app browsers usually send no referrer; their user agent still says whose app it is.
  const inApp = detectInAppBrowser(input.userAgent)
  if (inApp) return `ref:${inAppBrowserHost(inApp)}`

  const clickHost = hostFromClickIds(input.search)
  if (clickHost) return `ref:${clickHost}`

  return 'direct'
}

/**
 * The link to hand from an in-app browser to the system browser, carrying the source
 * this page captured. The in-memory value dies with the webview, so without this a
 * visitor who follows the notice into Safari signs up as `direct`.
 *
 * - `ref:<host>` → `utm_source=<host>&utm_medium=inapp`, which `deriveSignupSource`
 *   maps back to the same `ref:<host>`.
 * - A URL that already has UTM params is returned unchanged: they re-derive the same
 *   `utm:` value on the other side.
 * - `direct`, null, or anything else: unchanged.
 */
export function withInAppHandoffSource(href: string, source: string | null): string {
  if (!source || !source.startsWith('ref:')) return href
  try {
    const url = new URL(href)
    for (const key of url.searchParams.keys()) {
      if (key.startsWith('utm_')) return href
    }
    url.searchParams.set('utm_source', source.slice('ref:'.length))
    url.searchParams.set('utm_medium', IN_APP_HANDOFF_MEDIUM)
    return url.toString()
  } catch {
    return href
  }
}

/** Structural subset of NextRequest so route handlers and tests can both pass it. */
export interface SignupSourceRequestLike {
  headers: { get(name: string): string | null }
}

/** Server side: read the attribution value off an incoming request header. */
export function getSignupSourceFromRequest(request: SignupSourceRequestLike): string | null {
  return sanitizeSignupSource(request.headers.get(SIGNUP_SOURCE_HEADER))
}
