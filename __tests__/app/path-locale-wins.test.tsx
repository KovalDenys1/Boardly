// @ts-nocheck

/**
 * #1394, #928: /ru/..., /uk/... and /no/... render their own language on the
 * server, and a language the visitor stored earlier must not turn them back
 * after hydration.
 */

import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import i18n from '@/i18n'
import Providers from '@/app/providers'
import NoPageLocale from '@/components/i18n/NoPageLocale'
import RuPageLocale from '@/components/i18n/RuPageLocale'
import UkPageLocale from '@/components/i18n/UkPageLocale'
import { useTranslation } from '@/lib/i18n-helpers'
import { useLocalizedHref } from '@/lib/page-locale'
import ru from '@/locales/ru'
import uk from '@/locales/uk'
import en from '@/locales/en'
import no from '@/locales/no'

jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => <>{children}</>,
  useSession: () => ({ status: 'unauthenticated', data: null }),
}))
jest.mock('@/contexts/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/GuestContext', () => ({ GuestProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/OnboardingContext', () => ({ OnboardingProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/TourContext', () => ({ TourProvider: ({ children }) => <>{children}</> }))
jest.mock('@/components/DeferredGlobalEffects', () => () => null)
jest.mock('next/dynamic', () => () => () => null)

function GameName() {
  const { t } = useTranslation()
  return <p data-testid="name">{t('games.alias.name')}</p>
}

function YahtzeeName() {
  const { t } = useTranslation()
  return <p data-testid="yahtzee">{t('games.yahtzee.name')}</p>
}

function Links() {
  const localize = useLocalizedHref()
  return (
    <p data-testid="links">
      {[localize('/'), localize('/games'), localize('/games/alias'), localize('/games/alias/lobbies'), localize('/guides')].join(' ')}
    </p>
  )
}

describe('a prefixed page keeps its own language (#1394)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('renders Russian in the server HTML of /ru pages', () => {
    const html = renderToString(
      <RuPageLocale>
        <GameName />
      </RuPageLocale>
    )
    expect(html).toContain(ru.games.alias.name)
    expect(html).not.toContain(`>${en.games.alias.name}<`)
  })

  it('stays Russian after hydration when the visitor stored English', async () => {
    window.localStorage.setItem('i18nextLng', 'en')
    document.documentElement.lang = 'ru'

    render(
      <RuPageLocale>
        <Providers pathLocale="ru">
          <GameName />
        </Providers>
      </RuPageLocale>
    )
    await act(async () => {})

    expect(screen.getByTestId('name').textContent).toBe(ru.games.alias.name)
    expect(document.documentElement.lang).toBe('ru')
  })

  it('stays Ukrainian when the visitor stored Russian', async () => {
    window.localStorage.setItem('i18nextLng', 'ru')
    document.documentElement.lang = 'uk'

    render(
      <UkPageLocale>
        <Providers pathLocale="uk">
          <GameName />
        </Providers>
      </UkPageLocale>
    )
    await act(async () => {})

    expect(screen.getByTestId('name').textContent).toBe(uk.games.alias.name)
    expect(document.documentElement.lang).toBe('uk')
    expect(i18n.language).not.toBe('ru')
  })

  it('renders Norwegian in the server HTML of /no pages', () => {
    const html = renderToString(
      <NoPageLocale>
        <YahtzeeName />
      </NoPageLocale>
    )
    expect(html).toContain('>Yatzy<')
    expect(no.games.yahtzee.name).toBe('Yatzy')
    expect(html).not.toContain(`>${en.games.yahtzee.name}<`)
  })

  it('stays Norwegian after hydration when the visitor stored Russian', async () => {
    window.localStorage.setItem('i18nextLng', 'ru')
    document.documentElement.lang = 'nb'

    render(
      <NoPageLocale>
        <Providers pathLocale="no">
          <YahtzeeName />
        </Providers>
      </NoPageLocale>
    )
    await act(async () => {})

    expect(screen.getByTestId('yahtzee').textContent).toBe('Yatzy')
    expect(document.documentElement.lang).toBe('nb')
    expect(i18n.language).not.toBe('ru')
  })

  it('reads <html lang="nb"> as Norwegian in the shared instance toasts and helpers use', () => {
    document.documentElement.lang = 'nb'
    jest.isolateModules(() => {
      expect(require('@/i18n').default.language).toBe('no')
    })
  })

  it('links within the set stay in the page language, everything else stays English', () => {
    render(
      <RuPageLocale>
        <Links />
      </RuPageLocale>
    )
    expect(screen.getByTestId('links').textContent).toBe('/ru /ru/games /ru/games/alias /games/alias/lobbies /guides')
  })

  it('links within the set stay Norwegian on a /no page', () => {
    render(
      <NoPageLocale>
        <Links />
      </NoPageLocale>
    )
    expect(screen.getByTestId('links').textContent).toBe('/no /no/games /no/games/alias /games/alias/lobbies /guides')
  })

  it('leaves links alone on an unprefixed page', () => {
    render(<Links />)
    expect(screen.getByTestId('links').textContent).toBe('/ /games /games/alias /games/alias/lobbies /guides')
  })
})
