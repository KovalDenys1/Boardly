import { detectInAppBrowser, type InAppBrowser } from './social-referrers'

/**
 * Coarse classes of a User-Agent string, for operational events that must not store the
 * string itself (#1157): a device class and a browser family say "same kind of device" in
 * aggregate without fingerprinting anyone.
 */
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown'

export type BrowserFamily =
  | InAppBrowser
  | 'edge'
  | 'opera'
  | 'samsung'
  | 'firefox'
  | 'chrome'
  | 'safari'
  | 'headless'
  | 'webview'
  | 'http-client'
  | 'other'
  | 'unknown'

export function deviceClass(userAgent: string | null | undefined): DeviceClass {
  const ua = userAgent ?? ''
  if (!ua) return 'unknown'
  if (/\biPad\b|\bTablet\b|\bAndroid\b(?!.*\bMobile\b)/i.test(ua)) return 'tablet'
  if (/\bMobi|\biPhone\b|\biPod\b|\bWindows Phone\b/i.test(ua)) return 'mobile'
  // iPadOS Safari asks for the desktop site and sends a Macintosh User-Agent, so it lands here.
  if (/\bWindows NT\b|\bMacintosh\b|\bX11\b|\bCrOS\b/.test(ua)) return 'desktop'
  return 'unknown'
}

export function browserFamily(userAgent: string | null | undefined): BrowserFamily {
  const ua = userAgent ?? ''
  if (!ua) return 'unknown'
  if (/\bHeadlessChrome\/|\bPhantomJS\b|\bElectron\//.test(ua)) return 'headless'
  const inApp = detectInAppBrowser(ua)
  if (inApp) return inApp
  // An app's embedded browser: Android WebView marks itself "; wv)", iOS WKWebView omits Safari/.
  if (/;\s?wv\)/.test(ua) || (/\b(iPhone|iPad|iPod)\b/.test(ua) && /\bMobile\//.test(ua) && !/\bSafari\//.test(ua))) {
    return 'webview'
  }
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return 'edge'
  if (/\bOPR\/|\bOpera\b/.test(ua)) return 'opera'
  if (/\bSamsungBrowser\//.test(ua)) return 'samsung'
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return 'firefox'
  if (/\bCriOS\/|\bChrome\/|\bChromium\//.test(ua)) return 'chrome'
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'safari'
  if (/^(curl|wget|python|go-http-client|node|undici|axios|okhttp|java|libwww-perl|httpie|postman)/i.test(ua)) {
    return 'http-client'
  }
  return 'other'
}
