/**
 * Validates a browser-supplied Web Push `endpoint` before it is stored and, later, POSTed
 * to by `lib/push-send.ts` (`webpush.sendNotification` takes the endpoint's hostname and
 * port verbatim). `z.string().url()` alone accepts any https URL, so any signed-in user
 * could make the server probe arbitrary hosts and ports on every notification — a blind
 * SSRF, with a 404/410 response used as a small oracle (#1117, audit S2-02).
 *
 * The push standard has exactly a handful of real push services, one per browser vendor,
 * so an allowlist by hostname suffix is not a compromise here — every legitimate
 * subscription endpoint a browser hands back is one of these.
 */
const ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = [
  'fcm.googleapis.com', // Chrome, Edge, other Chromium browsers
  'android.googleapis.com', // Older Chrome/Android push endpoints
  'updates.push.services.mozilla.com', // Firefox
  'notify.windows.com', // Microsoft/Edge legacy WNS endpoints
  'push.apple.com', // Safari / web.push.apple.com
  'push.samsungosp.com', // Samsung Internet
] as const

const MAX_ENDPOINT_LENGTH = 2048
const MAX_P256DH_LENGTH = 200
const MAX_AUTH_LENGTH = 100

export const PUSH_ENDPOINT_LIMITS = {
  endpoint: MAX_ENDPOINT_LENGTH,
  p256dh: MAX_P256DH_LENGTH,
  auth: MAX_AUTH_LENGTH,
} as const

function matchesAllowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  )
}

/**
 * True only for an https URL, on the default port, whose host is one of the known push
 * services (or a subdomain of one). Anything else — a bare IP, a non-default port, a
 * lookalike domain, http — is refused before it ever reaches `fetch`/`https.request`.
 */
export function isAllowedPushEndpoint(rawUrl: string): boolean {
  if (rawUrl.length > MAX_ENDPOINT_LENGTH) return false

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }

  if (parsed.protocol !== 'https:') return false
  // An explicit non-default port (e.g. `:8443`) is never a real push service.
  if (parsed.port !== '') return false

  return matchesAllowedHost(parsed.hostname)
}
