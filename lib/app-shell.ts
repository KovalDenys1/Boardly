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

export function getAppShellInitScript() {
  return `(() => {
  try {
    let stored = null;
    try { stored = sessionStorage.getItem('${APP_SHELL_STORAGE_KEY}'); } catch {}
    const params = new URLSearchParams(location.search);
    const fromUrl = params.get('utm_source') === '${LAUNCH_SOURCE}' && params.get('utm_medium') === '${LAUNCH_MEDIUM}';
    if (stored !== '${APP_SHELL_PLAY}' && !fromUrl && !/${PLAY_REFERRER.source}/.test(document.referrer)) return;
    document.documentElement.dataset.appShell = '${APP_SHELL_PLAY}';
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
  const target = root ?? (typeof document === 'undefined' ? undefined : document.documentElement)
  return target?.dataset.appShell === APP_SHELL_PLAY
}
