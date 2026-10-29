// @ts-nocheck

/**
 * #1547: a visitor who lands on /no, /ru or /uk keeps that language on the
 * unprefixed lobby and game routes the page links to.
 */

import { act, render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import Providers from '@/app/providers'
import NoPageLocale from '@/components/i18n/NoPageLocale'
import RuPageLocale from '@/components/i18n/RuPageLocale'
import UkPageLocale from '@/components/i18n/UkPageLocale'
import { useTranslation } from '@/lib/i18n-helpers'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

let mockSession = { status: 'unauthenticated', data: null }

jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => <>{children}</>,
  useSession: () => mockSession,
}))
jest.mock('@/contexts/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/GuestContext', () => ({ GuestProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/OnboardingContext', () => ({ OnboardingProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/TourContext', () => ({ TourProvider: ({ children }) => <>{children}</> }))
jest.mock('@/components/DeferredGlobalEffects', () => () => null)
jest.mock('next/dynamic', () => () => () => null)

function LobbyTitle() {
  const { t } = useTranslation()
  return <p data-testid="lobby">{t('lobby.title')}</p>
}

const PREFIXED = [
  { locale: 'no', htmlLang: 'nb', Provider: NoPageLocale, text: no.lobby.title },
  { locale: 'ru', htmlLang: 'ru', Provider: RuPageLocale, text: ru.lobby.title },
  { locale: 'uk', htmlLang: 'uk', Provider: UkPageLocale, text: uk.lobby.title },
]

async function visitPrefixedPage({ locale, htmlLang, Provider }) {
  document.documentElement.lang = htmlLang
  const page = render(
    <Provider>
      <Providers pathLocale={locale}>
        <LobbyTitle />
      </Providers>
    </Provider>
  )
  await act(async () => {})
  page.unmount()
}

async function visitUnprefixedLobby() {
  document.documentElement.lang = 'en'
  await act(async () => {
    await i18n.changeLanguage('en')
  })
  render(
    <Providers>
      <LobbyTitle />
    </Providers>
  )
  await act(async () => {})
  await act(async () => {})
}

describe('the path locale carries into unprefixed routes (#1547)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    mockSession = { status: 'unauthenticated', data: null }
    await i18n.changeLanguage('en')
  })

  it.each(PREFIXED)('shows the lobby in the language of the /$locale page the visitor came from', async (page) => {
    expect(page.text).not.toBe(en.lobby.title)

    await visitPrefixedPage(page)
    await visitUnprefixedLobby()

    expect(screen.getByTestId('lobby').textContent).toBe(page.text)
  })

  it('stores the app code no, not the nb of <html lang>', async () => {
    await visitPrefixedPage(PREFIXED[0])

    expect(window.localStorage.getItem('i18nextLng')).toBe('no')
    expect(window.localStorage.getItem('language')).toBe('no')
  })

  it('keeps a stored English preference after a /no visit', async () => {
    window.localStorage.setItem('i18nextLng', 'en')
    window.localStorage.setItem('language', 'en')

    await visitPrefixedPage(PREFIXED[0])
    expect(window.localStorage.getItem('i18nextLng')).toBe('en')

    await visitUnprefixedLobby()
    expect(screen.getByTestId('lobby').textContent).toBe(en.lobby.title)
  })

  it('keeps a preference stored under the older language key alone', async () => {
    window.localStorage.setItem('language', 'uk')

    await visitPrefixedPage(PREFIXED[1])

    expect(window.localStorage.getItem('language')).toBe('uk')
    expect(window.localStorage.getItem('i18nextLng')).toBeNull()
  })

  it('does not write the path locale to a signed-in account', async () => {
    mockSession = { status: 'authenticated', data: { user: { id: 'user-1547', authenticatedAt: 1 } } }
    const fetchMock = jest.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock

    await visitPrefixedPage(PREFIXED[0])

    const bodies = fetchMock.mock.calls.map(([, init]) => init?.body)
    expect(bodies).not.toContain(JSON.stringify({ language: 'no' }))
    delete global.fetch
  })
})
