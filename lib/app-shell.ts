export const PLAY_APP_PACKAGE = 'online.boardly.app'
export const APP_SHELL_STORAGE_KEY = 'boardly:app-shell'

const APP_SHELL_PLAY = 'play'
const LAUNCH_SOURCE = 'android_app'
const LAUNCH_MEDIUM = 'twa'
const PLAY_REFERRER = new RegExp(`^android-app://${PLAY_APP_PACKAGE.replace(/\./g, '\\.')}(/|$)`)

export const PLAY_APP_SIGNUP_SOURCE = `utm:${LAUNCH_SOURCE}/${LAUNCH_MEDIUM}`

function isLaunchParams(params: URLSearchParams): boolean {
  return params.get('utm_source') === LAUNCH_SOURCE && params.get('utm_medium') === LAUNCH_MEDIUM
}

export function detectPlayLaunch(input: {
  search: string
  referrer: string
  stored: string | null
}): boolean {
  return (
    input.stored === APP_SHELL_PLAY ||
    isLaunchParams(new URLSearchParams(input.search)) ||
    PLAY_REFERRER.test(input.referrer)
  )
}

export function stripPlayLaunchParams(search: string): string {
  const params = new URLSearchParams(search)
  if (!isLaunchParams(params)) return search

  params.delete('utm_source')
  params.delete('utm_medium')
  const rest = params.toString()
  return rest ? `?${rest}` : ''
}

// A same-origin link with target="_blank" opens a tab whose sessionStorage starts empty.
export function addPlayLaunchParams(href: string, origin: string): string {
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return href
  }
  if (url.origin !== origin || isLaunchParams(url.searchParams)) return href

  url.searchParams.set('utm_source', LAUNCH_SOURCE)
  url.searchParams.set('utm_medium', LAUNCH_MEDIUM)
  return url.href
}

export function getAppShellInitScript() {
  return `(() => {
  try {
    let stored = null;
    try { stored = sessionStorage.getItem('${APP_SHELL_STORAGE_KEY}'); } catch {}
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('utm_source') === '${LAUNCH_SOURCE}' && params.get('utm_medium') === '${LAUNCH_MEDIUM}';
    if (stored !== '${APP_SHELL_PLAY}' && !fromUrl && !/${PLAY_REFERRER.source}/.test(document.referrer)) return;
    document.documentElement.dataset.appShell = '${APP_SHELL_PLAY}';
    document.addEventListener('click', (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target.toLowerCase() !== '_blank' || link.hasAttribute('download')) return;
      try {
        const url = new URL(link.href, location.origin);
        if (url.origin !== location.origin) return;
        if (url.searchParams.get('utm_source') === '${LAUNCH_SOURCE}' && url.searchParams.get('utm_medium') === '${LAUNCH_MEDIUM}') return;
        const original = link.getAttribute('href');
        url.searchParams.set('utm_source', '${LAUNCH_SOURCE}');
        url.searchParams.set('utm_medium', '${LAUNCH_MEDIUM}');
        link.href = url.href;
        setTimeout(() => link.setAttribute('href', original), 0);
      } catch {}
    }, true);
    sessionStorage.setItem('${APP_SHELL_STORAGE_KEY}', '${APP_SHELL_PLAY}');
    if (fromUrl) {
      params.delete('utm_source');
      params.delete('utm_medium');
      const rest = params.toString();
      history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
    }
  } catch {}
})();`
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
