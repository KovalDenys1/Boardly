import { PLAY_APP_SIGNUP_SOURCE } from '@/lib/app-shell'

type Client = typeof import('@/lib/signup-source-client')

function loadFresh(): Client {
  let client!: Client
  jest.isolateModules(() => {
    client = require('@/lib/signup-source-client')
  })
  return client
}

describe('captureSignupSource inside the Play app (#1465)', () => {
  afterEach(() => {
    delete document.documentElement.dataset.appShell
    window.history.replaceState({}, '', '/')
  })

  it('reports the Play app source although the launch parameters were stripped from the URL', () => {
    document.documentElement.dataset.appShell = 'play'
    window.history.replaceState({}, '', '/premium')

    expect(loadFresh().captureSignupSource()).toBe(PLAY_APP_SIGNUP_SOURCE)
  })

  it('sends the Play app source on the request that creates the account', () => {
    document.documentElement.dataset.appShell = 'play'

    expect(loadFresh().signupSourceHeaders()).toEqual({ 'X-Signup-Source': 'utm:android_app/twa' })
  })

  it('prefers the Play app over a utm_source left on the URL by a link inside the app', () => {
    document.documentElement.dataset.appShell = 'play'
    window.history.replaceState({}, '', '/?utm_source=newsletter&utm_medium=email')

    expect(loadFresh().captureSignupSource()).toBe(PLAY_APP_SIGNUP_SOURCE)
  })

  it('derives the source from the URL as before outside the app', () => {
    window.history.replaceState({}, '', '/?utm_source=newsletter&utm_medium=email')

    expect(loadFresh().captureSignupSource()).toBe('utm:newsletter/email')
  })

  it('stays direct outside the app with nothing on the URL', () => {
    expect(loadFresh().captureSignupSource()).toBe('direct')
  })
})
