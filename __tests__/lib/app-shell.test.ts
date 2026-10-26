import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import {
  APP_SHELL_STORAGE_KEY,
  PLAY_APP_PACKAGE,
  PLAY_APP_SIGNUP_SOURCE,
  isPlayApp,
  isPurchaseHref,
} from '@/lib/app-shell'
import {
  addPlayLaunchParams,
  detectPlayLaunch,
  getAppShellInitScript,
  stripPlayLaunchParams,
} from '@/lib/app-shell-script'

const LAUNCH_SEARCH = '?utm_source=android_app&utm_medium=twa'

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.6943.137 Mobile Safari/537.36'
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

type DisplayMode = 'standalone' | 'browser' | 'throws'

/** [label, user agent, display mode, whether that alone means the Play app] */
const DEVICES: [string, string, DisplayMode, boolean][] = [
  ['Android in standalone display mode', ANDROID_UA, 'standalone', true],
  ['Android Chrome in a tab', ANDROID_UA, 'browser', false],
  ['a Windows install', WINDOWS_UA, 'standalone', false],
  ['a Mac install', MAC_UA, 'standalone', false],
  ['an iPhone home-screen app', IPHONE_UA, 'standalone', false],
  ['Android where matchMedia throws', ANDROID_UA, 'throws', false],
]

function setDevice(userAgent: string, displayMode: DisplayMode) {
  jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  jest.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    if (displayMode === 'throws') throw new Error('matchMedia unavailable')
    return { matches: query === `(display-mode: ${displayMode})`, media: query } as MediaQueryList
  })
}

function runInitScript() {
  new Function(getAppShellInitScript())()
}

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { configurable: true, value })
}

describe('constants', () => {
  it('keep the values the Android app and the signup records rely on', () => {
    expect(PLAY_APP_PACKAGE).toBe('online.boardly.app')
    expect(APP_SHELL_STORAGE_KEY).toBe('boardly:app-shell')
    expect(PLAY_APP_SIGNUP_SOURCE).toBe('utm:android_app/twa')
  })
})

describe('detectPlayLaunch', () => {
  const base = { search: '', referrer: '', stored: null, standaloneAndroid: false }

  it('detects an Android page in standalone display mode, whatever else is missing', () => {
    expect(detectPlayLaunch({ ...base, standaloneAndroid: true })).toBe(true)
    expect(
      detectPlayLaunch({ ...base, referrer: 'https://boardly.online/leaderboard', standaloneAndroid: true })
    ).toBe(true)
  })

  it('detects the TWA start URL', () => {
    expect(detectPlayLaunch({ ...base, search: LAUNCH_SEARCH })).toBe(true)
  })

  it('needs both launch parameters', () => {
    expect(detectPlayLaunch({ ...base, search: '?utm_source=android_app' })).toBe(false)
  })

  it('detects the Play app as the referrer', () => {
    expect(detectPlayLaunch({ ...base, referrer: 'android-app://online.boardly.app/' })).toBe(true)
    expect(detectPlayLaunch({ ...base, referrer: 'android-app://online.boardly.app' })).toBe(true)
  })

  it('ignores another app as the referrer', () => {
    expect(detectPlayLaunch({ ...base, referrer: 'android-app://com.whatsapp/' })).toBe(false)
  })

  it('needs the package to match exactly', () => {
    expect(detectPlayLaunch({ ...base, referrer: 'android-app://online.boardly.app.evil/' })).toBe(false)
  })

  it('keeps a launch the tab already stored', () => {
    expect(detectPlayLaunch({ ...base, stored: 'play' })).toBe(true)
  })

  it('is false on a plain web visit', () => {
    expect(detectPlayLaunch(base)).toBe(false)
  })
})

describe('stripPlayLaunchParams', () => {
  it('keeps the other parameters', () => {
    expect(stripPlayLaunchParams(`?quick=1&utm_source=android_app&utm_medium=twa`)).toBe('?quick=1')
  })

  it('returns an empty string when nothing is left', () => {
    expect(stripPlayLaunchParams(LAUNCH_SEARCH)).toBe('')
  })

  it('leaves other campaigns alone', () => {
    const search = '?utm_source=newsletter&utm_medium=email'
    expect(stripPlayLaunchParams(search)).toBe(search)
  })
})

describe('addPlayLaunchParams', () => {
  const origin = 'https://boardly.online'

  it('adds the launch pair to a same-origin path', () => {
    expect(addPlayLaunchParams('/rules', origin)).toBe(
      'https://boardly.online/rules?utm_source=android_app&utm_medium=twa'
    )
  })

  it('keeps the other parameters and the hash', () => {
    expect(addPlayLaunchParams('https://boardly.online/u/abc?tab=stats#top', origin)).toBe(
      'https://boardly.online/u/abc?tab=stats&utm_source=android_app&utm_medium=twa#top'
    )
  })

  it('does not add the pair twice', () => {
    const href = 'https://boardly.online/terms?utm_source=android_app&utm_medium=twa'
    expect(addPlayLaunchParams(href, origin)).toBe(href)
  })

  it('leaves another origin alone', () => {
    expect(addPlayLaunchParams('https://discord.gg/boardly', origin)).toBe('https://discord.gg/boardly')
    expect(addPlayLaunchParams('https://boardly.online.evil.com/', origin)).toBe('https://boardly.online.evil.com/')
  })
})

describe('isPurchaseHref', () => {
  it('lets ordinary pages on the site through', () => {
    expect(isPurchaseHref('/games')).toBe(false)
    expect(isPurchaseHref('https://boardly.online/games/yahtzee?x=1')).toBe(false)
  })

  it('catches the Premium page and the Stripe routes', () => {
    expect(isPurchaseHref('/premium')).toBe(true)
    expect(isPurchaseHref('/premium?plan=yearly')).toBe(true)
    expect(isPurchaseHref('https://boardly.online/premium')).toBe(true)
    expect(isPurchaseHref('/api/stripe/checkout')).toBe(true)
  })

  it('catches anything off the site', () => {
    expect(isPurchaseHref('https://buy.stripe.com/abc')).toBe(true)
    expect(isPurchaseHref('//buy.stripe.com/abc')).toBe(true)
    expect(isPurchaseHref('https://boardly.online.evil.com/')).toBe(true)
    expect(isPurchaseHref('javascript:alert(1)')).toBe(true)
  })

  it('accepts the current origin when one is given', () => {
    expect(isPurchaseHref('http://localhost:3000/games', 'http://localhost:3000')).toBe(false)
    expect(isPurchaseHref('http://localhost:3000/premium', 'http://localhost:3000')).toBe(true)
    expect(isPurchaseHref('http://localhost:3000/games')).toBe(true)
  })
})

describe('getAppShellInitScript', () => {
  let installed: Parameters<typeof document.addEventListener>[] = []

  beforeEach(() => {
    delete document.documentElement.dataset.appShell
    sessionStorage.clear()
    setReferrer('')
    window.history.replaceState(null, '', '/')
    installed = []
    const addEventListener = document.addEventListener.bind(document)
    jest.spyOn(document, 'addEventListener').mockImplementation((...args) => {
      installed.push(args)
      addEventListener(...args)
    })
  })

  afterEach(() => {
    for (const args of installed) document.removeEventListener(...args)
    jest.restoreAllMocks()
  })

  it('marks a Play launch, remembers it and cleans the URL', () => {
    window.history.replaceState(null, '', `/${LAUNCH_SEARCH}`)

    runInitScript()

    expect(document.documentElement.dataset.appShell).toBe('play')
    expect(sessionStorage.getItem(APP_SHELL_STORAGE_KEY)).toBe('play')
    expect(window.location.search).toBe('')
  })

  describe('AdSense in the Play app', () => {
    type AdsQueue = { pauseAdRequests?: number; push?: unknown }
    const ads = () => (window as unknown as { adsbygoogle?: AdsQueue }).adsbygoogle

    afterEach(() => {
      delete (window as unknown as { adsbygoogle?: AdsQueue }).adsbygoogle
    })

    it('pauses every ad request on a Play launch, before the AdSense tag has loaded', () => {
      window.history.replaceState(null, '', `/${LAUNCH_SEARCH}`)

      runInitScript()

      expect(ads()?.pauseAdRequests).toBe(1)
    })

    it('pauses them on the tag AdSense already put in place', () => {
      const loaded: AdsQueue = { push: jest.fn() }
      ;(window as unknown as { adsbygoogle?: AdsQueue }).adsbygoogle = loaded
      sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')

      runInitScript()

      expect(ads()).toBe(loaded)
      expect(loaded.pauseAdRequests).toBe(1)
    })

    it('leaves AdSense alone on a plain web visit', () => {
      runInitScript()

      expect(ads()).toBeUndefined()
    })
  })

  it('keeps the other parameters and the hash in the cleaned URL', () => {
    window.history.replaceState(null, '', `/games${LAUNCH_SEARCH}&quick=1#top`)

    runInitScript()

    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/games?quick=1#top')
  })

  it('marks a launch from the Play app referrer', () => {
    setReferrer('android-app://online.boardly.app/')

    runInitScript()

    expect(document.documentElement.dataset.appShell).toBe('play')
    expect(sessionStorage.getItem(APP_SHELL_STORAGE_KEY)).toBe('play')
  })

  it('does not mark another app as the referrer', () => {
    setReferrer('android-app://online.boardly.app.evil/')

    runInitScript()

    expect(document.documentElement.dataset.appShell).toBeUndefined()
  })

  it('marks a later page of a tab that was launched from the app', () => {
    sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')

    runInitScript()

    expect(document.documentElement.dataset.appShell).toBe('play')
  })

  it('leaves a plain web visit alone', () => {
    window.history.replaceState(null, '', '/?utm_source=newsletter&utm_medium=email')
    const setItem = jest.spyOn(sessionStorage, 'setItem')

    runInitScript()

    expect(document.documentElement.dataset.appShell).toBeUndefined()
    expect(setItem).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?utm_source=newsletter&utm_medium=email')
  })

  it('still marks the page when the tab cannot store it', () => {
    window.history.replaceState(null, '', `/${LAUNCH_SEARCH}`)
    jest.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    expect(runInitScript).not.toThrow()

    expect(document.documentElement.dataset.appShell).toBe('play')
  })

  it('keeps the launch parameters when the tab cannot remember the launch', () => {
    window.history.replaceState(null, '', `/${LAUNCH_SEARCH}`)
    jest.spyOn(sessionStorage, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    runInitScript()

    expect(window.location.search).toBe(LAUNCH_SEARCH)
  })

  describe('display mode and platform', () => {
    it('marks a tab Chrome restored after a full page load, and stores the mark again (#1486)', () => {
      setDevice(ANDROID_UA, 'standalone')
      setReferrer('https://boardly.online/leaderboard')

      runInitScript()

      expect(document.documentElement.dataset.appShell).toBe('play')
      expect(sessionStorage.getItem(APP_SHELL_STORAGE_KEY)).toBe('play')
    })

    it.each(DEVICES)('with no other signal, %s', (_label, userAgent, displayMode, play) => {
      setDevice(userAgent, displayMode)

      expect(runInitScript).not.toThrow()

      expect(document.documentElement.dataset.appShell).toBe(play ? 'play' : undefined)
      expect(sessionStorage.getItem(APP_SHELL_STORAGE_KEY)).toBe(play ? 'play' : null)
    })

    it('still honours the other signals when matchMedia throws', () => {
      setDevice(ANDROID_UA, 'throws')
      window.history.replaceState(null, '', `/${LAUNCH_SEARCH}`)

      runInitScript()

      expect(document.documentElement.dataset.appShell).toBe('play')
      expect(window.location.search).toBe('')
    })

    const pages: [string, { search: string; referrer: string; stored: string | null }][] = [
      ['a plain visit', { search: '', referrer: '', stored: null }],
      ['a same-site full load', { search: '', referrer: 'https://boardly.online/leaderboard', stored: null }],
      ['the start URL', { search: LAUNCH_SEARCH, referrer: '', stored: null }],
      ['the Play referrer', { search: '', referrer: 'android-app://online.boardly.app/', stored: null }],
      ['another app as the referrer', { search: '', referrer: 'android-app://com.whatsapp/', stored: null }],
      ['a stored launch', { search: '', referrer: '', stored: 'play' }],
    ]

    it.each(DEVICES.flatMap(([device, ua, mode, standaloneAndroid]) =>
      pages.map(([page, input]) => [device, page, ua, mode, standaloneAndroid, input] as const)
    ))('marks exactly when detectPlayLaunch does: %s, %s', (_device, _page, ua, mode, standaloneAndroid, input) => {
      setDevice(ua, mode)
      window.history.replaceState(null, '', `/${input.search}`)
      setReferrer(input.referrer)
      if (input.stored) sessionStorage.setItem(APP_SHELL_STORAGE_KEY, input.stored)

      runInitScript()

      expect(document.documentElement.dataset.appShell === 'play').toBe(
        detectPlayLaunch({ ...input, standaloneAndroid })
      )
    })
  })

  describe('links that open a new tab', () => {
    const origin = () => window.location.origin

    function anchor(href: string, attributes: Record<string, string> = {}) {
      const a = document.createElement('a')
      a.setAttribute('href', href)
      for (const [name, value] of Object.entries(attributes)) a.setAttribute(name, value)
      document.body.appendChild(a)
      return a
    }

    /** Clicks without letting jsdom navigate, and returns the href the browser would follow. */
    function click(target: HTMLElement, a: HTMLAnchorElement = target as HTMLAnchorElement) {
      let followed = ''
      const stop = (event: Event) => {
        followed = a.href
        event.preventDefault()
      }
      document.addEventListener('click', stop)
      target.click()
      document.removeEventListener('click', stop)
      return followed
    }

    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
      document.body.innerHTML = ''
    })

    it('carries the launch pair into a same-origin new tab, then puts the href back', () => {
      sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')
      runInitScript()
      const a = anchor('/rules?game=yahtzee#scoring', { target: '_blank' })

      expect(click(a)).toBe(`${origin()}/rules?game=yahtzee&utm_source=android_app&utm_medium=twa#scoring`)

      jest.runAllTimers()
      expect(a.getAttribute('href')).toBe('/rules?game=yahtzee#scoring')
    })

    it('rewrites the link when the tap lands on an element inside it, and never adds the pair twice', () => {
      sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')
      runInitScript()
      const a = anchor('/rules', { target: '_blank' })
      const inner = document.createElement('span')
      a.appendChild(inner)
      const expected = `${origin()}/rules?utm_source=android_app&utm_medium=twa`

      expect(click(inner, a)).toBe(expected)
      expect(click(inner, a)).toBe(expected)

      jest.runAllTimers()
      expect(a.getAttribute('href')).toBe('/rules')
    })

    it.each([
      ['an off-origin new-tab link', 'https://discord.gg/boardly', { target: '_blank' }],
      ['a same-tab link', '/rules', {}],
      ['a download link', '/exports/game.json', { target: '_blank', download: '' }],
    ])('leaves %s alone', (_label, href, attributes) => {
      sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')
      runInitScript()
      const a = anchor(href, attributes)

      expect(click(a)).toBe(new URL(href, origin()).href)
      jest.runAllTimers()
      expect(a.getAttribute('href')).toBe(href)
    })

    it('follows the same rule as addPlayLaunchParams', () => {
      sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')
      runInitScript()
      const hrefs = [
        '/rules',
        '/rules?game=yahtzee#scoring',
        '/u/abc?tab=stats&utm_source=newsletter',
        '/terms?utm_source=android_app&utm_medium=twa',
        '/privacy?utm_source=android_app',
        `${origin()}/privacy`,
        'https://discord.gg/boardly',
        '//evil.example/x',
        'https://boardly.online.evil.com/',
      ]

      for (const href of hrefs) {
        const a = anchor(href, { target: '_blank' })
        expect({ href, followed: click(a) }).toEqual({
          href,
          followed: new URL(addPlayLaunchParams(href, origin()), origin()).href,
        })
        jest.runAllTimers()
      }
    })

    it('installs nothing on a plain web visit', () => {
      runInitScript()

      expect(document.addEventListener).not.toHaveBeenCalled()
      const a = anchor('/rules', { target: '_blank' })
      expect(click(a)).toBe(`${origin()}/rules`)
    })
  })
})

describe('isPlayApp', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.appShell
    sessionStorage.clear()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('is true only when the attribute says play', () => {
    const root = document.createElement('html')
    expect(isPlayApp(root)).toBe(false)

    root.dataset.appShell = 'play'
    expect(isPlayApp(root)).toBe(true)

    root.dataset.appShell = 'web'
    expect(isPlayApp(root)).toBe(false)
  })

  it('reads the document element by default', () => {
    delete document.documentElement.dataset.appShell
    expect(isPlayApp()).toBe(false)

    document.documentElement.dataset.appShell = 'play'
    expect(isPlayApp()).toBe(true)

    delete document.documentElement.dataset.appShell
  })

  it('falls back to the stored launch when React has stripped the attribute', () => {
    sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')

    expect(document.documentElement.dataset.appShell).toBeUndefined()
    expect(isPlayApp()).toBe(true)
  })

  it('ignores the stored launch when a root is passed', () => {
    sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')

    expect(isPlayApp(document.createElement('html'))).toBe(false)
  })

  it('is false when the tab cannot read storage', () => {
    jest.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    expect(isPlayApp()).toBe(false)
  })

  it.each(DEVICES)('with no attribute and no stored launch, %s', (_label, userAgent, displayMode, play) => {
    setDevice(userAgent, displayMode)

    expect(isPlayApp()).toBe(play)
  })

  it('reads the display mode when the tab cannot read storage', () => {
    setDevice(ANDROID_UA, 'standalone')
    jest.spyOn(sessionStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })

    expect(isPlayApp()).toBe(true)
  })

  it('still reads the stored launch when matchMedia throws', () => {
    setDevice(ANDROID_UA, 'throws')
    sessionStorage.setItem(APP_SHELL_STORAGE_KEY, 'play')

    expect(isPlayApp()).toBe(true)
  })

  it('ignores the display mode when a root is passed', () => {
    setDevice(ANDROID_UA, 'standalone')

    expect(isPlayApp(document.createElement('html'))).toBe(false)
  })
})

describe('pages served outside the Next.js layout', () => {
  it('offline.html runs the same app-shell script as the layout', () => {
    const html = readFileSync(join(process.cwd(), 'public/offline.html'), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain(`<script>${getAppShellInitScript()}</script>`)
  })
})

describe('the head script stays out of client bundles', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return sourceFiles(path)
      return /\.tsx?$/.test(entry.name) ? [path] : []
    })
  }

  it('is imported only by server code, never by a client module', () => {
    const root = process.cwd()
    const importers = ['app', 'components', 'hooks', 'lib']
      .flatMap((dir) => sourceFiles(join(root, dir)))
      .filter((file) => /from '(@\/lib|\.)\/app-shell-script'/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file))
      .sort()

    expect(importers).toEqual(['app/api/notifications/unsubscribe/route.ts', 'app/layout.tsx'])
  })

  it('leaves lib/app-shell.ts, which client modules import, with no imports of its own', () => {
    expect(readFileSync(join(process.cwd(), 'lib/app-shell.ts'), 'utf8')).not.toMatch(/^import /m)
  })
})

describe('purchase UI rule in globals.css', () => {
  it('hides every purchase marker inside the Play app', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

    expect(css).toMatch(
      /html\[data-app-shell='play'\] \[data-purchase-ui\]\s*\{\s*display:\s*none !important;\s*\}/
    )
  })
})
