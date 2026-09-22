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
 * The campaign is kept because without it two posts on the same platform are the same row,
 * and the Revenue Plan's way of testing a channel is to run it for three weeks and compare.
 */

/** Carries the in-memory value on the request that creates the account. */
export const SIGNUP_SOURCE_HEADER = 'X-Signup-Source'
/** Carries it across an OAuth redirect, where no page survives to send a header. */
export const SIGNUP_SOURCE_PARAM = 'bd_src'
export const SIGNUP_SOURCE_MAX_LENGTH = 120

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
}): string {
  const utmSource = sanitizeSignupSource(input.utmSource)
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
      const host = new URL(input.referrer).hostname.replace(/^www\./, '')
      const own = (input.currentHostname ?? '').replace(/^www\./, '')
      if (host && host !== own) {
        return sanitizeSignupSource(`ref:${host}`) ?? 'direct'
      }
    } catch {
      // malformed referrer — treat as direct
    }
  }

  return 'direct'
}

/** Structural subset of NextRequest so route handlers and tests can both pass it. */
export interface SignupSourceRequestLike {
  headers: { get(name: string): string | null }
}

/** Server side: read the attribution value off an incoming request header. */
export function getSignupSourceFromRequest(request: SignupSourceRequestLike): string | null {
  return sanitizeSignupSource(request.headers.get(SIGNUP_SOURCE_HEADER))
}
