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
  const base = { search: '', referrer: '', stored: null }

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
