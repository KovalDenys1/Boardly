/**
 * Invite-link attribution (#920).
 *
 * A copied invite link carries a share marker (`?via=invite`), so the lobby page can tell
 * someone who arrived through a shared link from someone who typed the code. Without the
 * marker the only signal is the referrer, which same-origin navigation and most chat apps
 * strip; so the marker is the primary signal and an external referrer the fallback.
 */

export const INVITE_SHARE_PARAM = 'via'
export const INVITE_SHARE_VALUE = 'invite'

export type InviteAttribution =
  | { via: 'share_link' }
  | { via: 'external_referrer'; referrerHost: string }

/** The link the copy-invite buttons put on the clipboard. */
export function buildInviteLink(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/lobby/${encodeURIComponent(code)}?${INVITE_SHARE_PARAM}=${INVITE_SHARE_VALUE}`
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/^www\./, '')
}

/**
 * Pure: decides whether a lobby page load counts as an opened invite.
 * Returns null for a plain load (typed code, own navigation, refresh).
 */
export function parseInviteAttribution(input: {
  search: string | null | undefined
  referrer: string | null | undefined
  currentHostname: string | null | undefined
}): InviteAttribution | null {
  const params = new URLSearchParams(input.search ?? '')
  if (params.get(INVITE_SHARE_PARAM) === INVITE_SHARE_VALUE) {
    return { via: 'share_link' }
  }

  if (input.referrer) {
    try {
      const host = normalizeHost(new URL(input.referrer).hostname)
      const own = normalizeHost(input.currentHostname)
      if (host && host !== own) {
        return { via: 'external_referrer', referrerHost: host }
      }
    } catch {
      // malformed referrer – not an invite
    }
  }

  return null
}

/** The URL with the share marker removed, so a refresh does not count as a second open. */
export function stripInviteMarker(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.get(INVITE_SHARE_PARAM) !== INVITE_SHARE_VALUE) return url
    parsed.searchParams.delete(INVITE_SHARE_PARAM)
    return parsed.toString()
  } catch {
    return url
  }
}
