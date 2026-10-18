export const PLAY_APP_PACKAGE = 'online.boardly.app'
export const APP_SHELL_STORAGE_KEY = 'boardly:app-shell'
export const APP_SHELL_PLAY = 'play'
export const LAUNCH_SOURCE = 'android_app'
export const LAUNCH_MEDIUM = 'twa'

export const PLAY_APP_SIGNUP_SOURCE = `utm:${LAUNCH_SOURCE}/${LAUNCH_MEDIUM}`

const SITE_ORIGIN = 'https://boardly.online'
const PURCHASE_PATHS = ['/premium', '/api/stripe']

export function isPurchaseHref(href: string, origin?: string): boolean {
  let url: URL
  try {
    url = new URL(href, SITE_ORIGIN)
  } catch {
    return true
  }
  if (url.origin !== SITE_ORIGIN && url.origin !== origin) return true

  const path = url.pathname.toLowerCase()
  return PURCHASE_PATHS.some((prefix) => path.startsWith(prefix))
}

export function isPlayApp(root?: HTMLElement): boolean {
  if (root) return root.dataset.appShell === APP_SHELL_PLAY
  if (typeof document === 'undefined') return false
  if (document.documentElement.dataset.appShell === APP_SHELL_PLAY) return true
  // React removes <html> attributes it did not set when it mounts the root instead of hydrating it.
  try {
    return sessionStorage.getItem(APP_SHELL_STORAGE_KEY) === APP_SHELL_PLAY
  } catch {
    return false
  }
}
