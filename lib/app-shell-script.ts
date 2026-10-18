import { APP_SHELL_PLAY, APP_SHELL_STORAGE_KEY, LAUNCH_MEDIUM, LAUNCH_SOURCE, PLAY_APP_PACKAGE } from './app-shell'

const PLAY_REFERRER = new RegExp(`^android-app://${PLAY_APP_PACKAGE.replace(/\./g, '\\.')}(/|$)`)

function isLaunchParams(params: URLSearchParams): boolean {
  return params.get('utm_source') === LAUNCH_SOURCE && params.get('utm_medium') === LAUNCH_MEDIUM
}

export function detectPlayLaunch(input: {
  search: string
  referrer: string
  stored: string | null
  standaloneAndroid: boolean
}): boolean {
  return (
    input.stored === APP_SHELL_PLAY ||
    isLaunchParams(new URLSearchParams(input.search)) ||
    PLAY_REFERRER.test(input.referrer) ||
    input.standaloneAndroid
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

// The Play listing declares no ads, so the app pauses every AdSense request; the consent message still loads.
export function getAppShellInitScript() {
  return `(() => {
  try {
    let stored = null;
    try { stored = sessionStorage.getItem('${APP_SHELL_STORAGE_KEY}'); } catch {}
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('utm_source') === '${LAUNCH_SOURCE}' && params.get('utm_medium') === '${LAUNCH_MEDIUM}';
    let standaloneAndroid = false;
    try { standaloneAndroid = /Android/i.test(navigator.userAgent) && matchMedia('(display-mode: standalone)').matches; } catch {}
    if (stored !== '${APP_SHELL_PLAY}' && !fromUrl && !/${PLAY_REFERRER.source}/.test(document.referrer) && !standaloneAndroid) return;
    document.documentElement.dataset.appShell = '${APP_SHELL_PLAY}';
    try { (window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 1; } catch {}
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
