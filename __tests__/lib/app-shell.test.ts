import { readFileSync } from 'fs'
import { join } from 'path'
import {
  APP_SHELL_STORAGE_KEY,
  PLAY_APP_PACKAGE,
  PLAY_APP_SIGNUP_SOURCE,
  detectPlayLaunch,
  getAppShellInitScript,
  isPlayApp,
  stripPlayLaunchParams,
} from '@/lib/app-shell'

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

describe('getAppShellInitScript', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.appShell
    sessionStorage.clear()
    setReferrer('')
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
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

describe('purchase UI rule in globals.css', () => {
  it('hides every purchase marker inside the Play app', () => {
    const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

    expect(css).toMatch(
      /html\[data-app-shell='play'\] \[data-purchase-ui\]\s*\{\s*display:\s*none !important;\s*\}/
    )
  })
})
