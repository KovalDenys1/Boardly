/**
 * @jest-environment jsdom
 */
import { act, render, waitFor } from '@testing-library/react'
import { AccountLanguageSync } from '@/components/AccountLanguageSync'

type Listener = (language: string) => void
const mockListeners = new Set<Listener>()

jest.mock('@/i18n', () => ({
  __esModule: true,
  availableLocales: ['en', 'uk', 'no', 'ru'],
  defaultLocale: 'en',
  default: {
    on: (_event: string, listener: Listener) => mockListeners.add(listener),
    off: (_event: string, listener: Listener) => mockListeners.delete(listener),
  },
}))

const mockUseSession = jest.fn()
jest.mock('next-auth/react', () => ({
  useSession: () => mockUseSession(),
}))

const fetchMock = jest.fn()

function signedIn(authenticatedAt = 1_000) {
  mockUseSession.mockReturnValue({ status: 'authenticated', data: { user: { id: 'user-1', authenticatedAt } } })
}

// What LanguageSwitcher and the profile's language setting do: store the choice, then change i18n.
function switchLanguage(language: string) {
  window.localStorage.setItem('i18nextLng', language)
  window.localStorage.setItem('language', language)
  act(() => {
    for (const listener of [...mockListeners]) listener(language)
  })
}

const writes = () =>
  fetchMock.mock.calls.map(([url, init]) => [url, init.method, JSON.parse(init.body).language])

describe('AccountLanguageSync (#1331)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    mockListeners.clear()
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('stores the new locale once when a signed-in person switches language', async () => {
    window.localStorage.setItem('language', 'en')
    signedIn()
    render(<AccountLanguageSync />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    switchLanguage('no')
    // Providers and the switcher can both report the same change.
    switchLanguage('no')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    expect(writes()).toEqual([
      ['/api/user/language', 'PUT', 'en'],
      ['/api/user/language', 'PUT', 'no'],
    ])
  })

  it('writes once per sign-in, not on every page load of the same sign-in', async () => {
    window.localStorage.setItem('language', 'uk')
    signedIn(1_000)
    const first = render(<AccountLanguageSync />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    first.unmount()

    render(<AccountLanguageSync />)
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    signedIn(2_000)
    render(<AccountLanguageSync />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(writes()[1]).toEqual(['/api/user/language', 'PUT', 'uk'])
  })

  it('writes nothing for a visitor who is not signed in', async () => {
    mockUseSession.mockReturnValue({ status: 'unauthenticated', data: null })
    render(<AccountLanguageSync />)
    switchLanguage('ru')
    await act(async () => {})

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('tries again on the next change after a failed write', async () => {
    window.localStorage.setItem('language', 'en')
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 })
    signedIn()
    render(<AccountLanguageSync />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => {})

    switchLanguage('en')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
