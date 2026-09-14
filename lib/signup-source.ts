/**
 * Acquisition-source attribution.
 *
 * The client captures where a visitor came from on their first page view
 * (UTM params or the referrer hostname) into a first-party cookie. The server
 * then copies that value onto `Users.signupSource` when the account is created
 * (guest, e-mail registration, or OAuth). Nothing else reads the cookie.
 *
 * Value shapes: `utm:<source>[/<medium>[/<campaign>]]`, `ref:<hostname>`, `direct`.
 *
 * The campaign is kept because without it two posts on the same platform are the same row,
 * and the Revenue Plan's way of testing a channel is to run it for three weeks and compare.
 */

export const SIGNUP_SOURCE_COOKIE = 'bd_src'
export const SIGNUP_SOURCE_MAX_LENGTH = 120
export const SIGNUP_SOURCE_COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60

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
  cookies: { get(name: string): { value: string } | undefined }
}

/** Server side: read the attribution cookie off an incoming request. */
export function getSignupSourceFromRequest(request: SignupSourceRequestLike): string | null {
  return sanitizeSignupSource(request.cookies.get(SIGNUP_SOURCE_COOKIE)?.value)
}
