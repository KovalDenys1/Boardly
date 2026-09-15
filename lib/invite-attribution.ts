/**
 * Invite-link attribution (#920).
 *
 * A copied invite link carries a share marker (`?via=invite`), so the lobby page can tell
 * someone who arrived through a shared link from someone who typed the code. Without the
 * marker the only signal is the referrer, which same-origin navigation and most chat apps
 * strip; so the marker is the primary signal and an external referrer the fallback.
 *
 * The referrer is trusted only when this document was created at the lobby URL by a normal
 * navigation. `document.referrer` is fixed when the document is created and survives App
 * Router soft navigation, so a visitor who lands on `/` from Google and presses Quick Play
 * still carries the Google referrer on `/lobby/<code>`; and a reload after the marker was
 * stripped carries it too. The Navigation Timing entry says which URL the document was
 * created at and whether it was a navigation, a reload or a history traversal.
 */

export const INVITE_SHARE_PARAM = 'via'
export const INVITE_SHARE_VALUE = 'invite'

export type InviteAttribution =
  | { via: 'share_link' }
  | { via: 'external_referrer'; referrerHost: string }

/** What the Navigation Timing entry says about how this document came to exist. */
export type DocumentNavigation = {
  /** The URL the document was created at (`PerformanceNavigationTiming.name`). */
  url: string
  /** `navigate`, `reload`, `back_forward` or `prerender`. */
  type: string
}

/** The link the copy-invite buttons put on the clipboard. */
export function buildInviteLink(code: string, origin: string): string {
  const base = origin.replace(/\/+$/, '')
  return `${base}/lobby/${encodeURIComponent(code)}?${INVITE_SHARE_PARAM}=${INVITE_SHARE_VALUE}`
}

function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').trim().toLowerCase().replace(/^www\./, '')
}

function normalizePath(path: string): string {
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // keep the raw path – it will simply not match
  }
  return decoded.toLowerCase().replace(/\/+$/, '')
}

/**
 * True when the document was created at `/lobby/<code>` by a normal navigation, so the
 * referrer describes how the visitor reached this lobby and not some earlier page.
 */
export function documentLoadedAtLobby(
  navigation: Partial<DocumentNavigation> | null | undefined,
  code: string
): boolean {
  if (!navigation?.url || navigation.type !== 'navigate') return false
  try {
    const lobbyPath = normalizePath(`/lobby/${code}`)
    const documentPath = normalizePath(new URL(navigation.url, 'http://localhost').pathname)
    return documentPath === lobbyPath || documentPath.startsWith(`${lobbyPath}/`)
  } catch {
    return false
  }
}

/**
 * Pure: decides whether a lobby page load counts as an opened invite.
 * Returns null for a plain load (typed code, own navigation, refresh, soft navigation).
 */
export function parseInviteAttribution(input: {
  code: string
  search: string | null | undefined
  referrer: string | null | undefined
  currentHostname: string | null | undefined
  /** From `readDocumentNavigation()`; null or undefined disables the referrer fallback. */
  navigation: Partial<DocumentNavigation> | null | undefined
}): InviteAttribution | null {
  const params = new URLSearchParams(input.search ?? '')
  if (params.get(INVITE_SHARE_PARAM) === INVITE_SHARE_VALUE) {
    return { via: 'share_link' }
  }

  if (input.referrer && documentLoadedAtLobby(input.navigation, input.code)) {
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

/**
 * Reads the Navigation Timing entry of the current document. Null when the API is missing
 * or the entry is not there yet, which the parser treats as "do not trust the referrer".
 */
export function readDocumentNavigation(): DocumentNavigation | null {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return null
  }
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (!entry?.name) return null
    return { url: entry.name, type: entry.type }
  } catch {
    return null
  }
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
