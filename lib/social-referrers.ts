/**
 * Social traffic, read the way the platforms actually send it (#1091).
 *
 * Three problems with taking the referrer hostname at face value:
 *
 * 1. One platform arrives under several hosts. Instagram's link shim is
 *    `l.instagram.com`, Facebook's is `l.facebook.com` / `lm.facebook.com`, mobile
 *    Facebook is `m.facebook.com`, X wraps every link in `t.co`, YouTube is
 *    `m.youtube.com` or `youtu.be`. Stored raw, each is its own row and no channel
 *    adds up.
 * 2. Android apps send an `android-app://<package>/` referrer, whose "hostname" is
 *    a package id like `com.zhiliaoapp.musically` (TikTok).
 * 3. The in-app browsers of Instagram, Facebook and TikTok very often send no
 *    referrer at all, so a visitor from a bio link lands as `direct`. Their user
 *    agents say where they are, and Meta and TikTok append click ids.
 *
 * Everything maps onto the `ref:<host>` shape the Control Panel already parses
 * (`boardly-control-panel/lib/analytics/acquisition.ts`), so no reader changes.
 */

/** Hostname suffix → the one host a channel is stored under. */
const HOST_ALIASES: ReadonlyArray<readonly [suffix: string, canonical: string]> = [
  ['instagram.com', 'instagram.com'],
  ['messenger.com', 'messenger.com'],
  ['facebook.com', 'facebook.com'],
  ['fb.com', 'facebook.com'],
  ['fb.me', 'facebook.com'],
  ['tiktok.com', 'tiktok.com'],
  ['youtube.com', 'youtube.com'],
  ['youtu.be', 'youtube.com'],
  ['t.co', 'x.com'],
  ['twitter.com', 'x.com'],
  ['x.com', 'x.com'],
  ['snapchat.com', 'snapchat.com'],
]

/** `android-app://<package>/` referrers from the platforms' Android apps. */
const ANDROID_APP_HOSTS: Record<string, string> = {
  'com.instagram.android': 'instagram.com',
  'com.facebook.katana': 'facebook.com',
  'com.facebook.lite': 'facebook.com',
  'com.facebook.orca': 'messenger.com',
  'com.zhiliaoapp.musically': 'tiktok.com',
  'com.ss.android.ugc.trill': 'tiktok.com',
  'com.google.android.youtube': 'youtube.com',
  'com.twitter.android': 'x.com',
  'com.snapchat.android': 'snapchat.com',
}

/**
 * Lower-cases, drops `www.`, and folds a platform's many hosts into one.
 * Hosts that belong to no known platform come back unchanged apart from that.
 */
export function canonicalReferrerHost(host: string | null | undefined): string {
  const h = (host ?? '').trim().toLowerCase().replace(/^www\./, '')
  if (!h) return ''
  if (ANDROID_APP_HOSTS[h]) return ANDROID_APP_HOSTS[h]
  for (const [suffix, canonical] of HOST_ALIASES) {
    if (h === suffix || h.endsWith(`.${suffix}`)) return canonical
  }
  return h
}

export type InAppBrowser = 'instagram' | 'facebook' | 'messenger' | 'tiktok' | 'snapchat'

/**
 * Which social app's embedded browser this is, from the user agent, or null.
 * Order matters: Messenger's UA also carries `FBAN`, and Instagram's on some
 * Android builds carries `FB_IAB`.
 */
export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowser | null {
  const ua = userAgent ?? ''
  if (!ua) return null
  if (/\bInstagram\b/i.test(ua)) return 'instagram'
  if (/MessengerForiOS|FB_IAB\/MESSENGER|\bOrca-Android\b/i.test(ua)) return 'messenger'
  if (/FBAN\/|FBAV\/|FB_IAB|FBIOS|\bFB4A\b/.test(ua)) return 'facebook'
  if (/musical_ly|BytedanceWebview|\bTikTok\b|trill_|\bByteLocale\b/i.test(ua)) return 'tiktok'
  if (/\bSnapchat\b/i.test(ua)) return 'snapchat'
  return null
}

const IN_APP_HOST: Record<InAppBrowser, string> = {
  instagram: 'instagram.com',
  facebook: 'facebook.com',
  messenger: 'messenger.com',
  tiktok: 'tiktok.com',
  snapchat: 'snapchat.com',
}

export function inAppBrowserHost(app: InAppBrowser): string {
  return IN_APP_HOST[app]
}

/**
 * Click ids the platforms append to outbound links, in priority order. `igshid`
 * before `fbclid` because Instagram links carry both and Instagram is the
 * narrower answer.
 */
const CLICK_ID_HOSTS: ReadonlyArray<readonly [param: string, host: string]> = [
  ['ttclid', 'tiktok.com'],
  ['igshid', 'instagram.com'],
  ['fbclid', 'facebook.com'],
]

export function hostFromClickIds(search: string | null | undefined): string | null {
  if (!search) return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return null
  }
  for (const [param, host] of CLICK_ID_HOSTS) {
    if (params.get(param)) return host
  }
  return null
}
