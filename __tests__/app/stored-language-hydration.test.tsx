// @ts-nocheck

/**
 * #1571: an unprefixed page is served in English, and Providers switches the
 * shared i18n instance to the visitor's stored language after the first commit.
 * Everything inside a Suspense boundary – a page's own, and every next/dynamic
 * component – hydrates after that commit, so it must still render the English
 * the server sent and switch afterwards. Holding the boundary until the switch
 * makes the browser's race deterministic.
 */

import { act, Suspense, use, useEffect } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { waitFor } from '@testing-library/react'
import i18n from '@/i18n'
import Providers from '@/app/providers'
import LobbyListPage from '@/app/(site)/lobby/page'
import GamesClient from '@/app/(site)/games/GamesClient'
import LeaderboardClient from '@/app/(site)/leaderboard/LeaderboardClient'
import YahtzeeLobbiesPage from '@/app/(site)/games/yahtzee/lobbies/page'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useTranslation } from '@/lib/i18n-helpers'
import { getCatalogGames } from '@/lib/game-catalog'
import en from '@/locales/en'
import no from '@/locales/no'

jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => <>{children}</>,
  useSession: () => ({ status: 'unauthenticated', data: null }),
}))
jest.mock('@/contexts/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/GuestContext', () => ({
  GuestProvider: ({ children }) => <>{children}</>,
  useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }),
}))
jest.mock('@/contexts/OnboardingContext', () => ({ OnboardingProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/TourContext', () => ({ TourProvider: ({ children }) => <>{children}</> }))
jest.mock('@/components/DeferredGlobalEffects', () => () => null)
jest.mock('next/dynamic', () => () => () => null)
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
jest.mock('@/lib/supabase-client', () => {
  const channel = { on: () => channel, subscribe: () => channel }
  return { getSupabaseClient: () => ({ channel: () => channel, removeChannel: async () => ({}) }) }
})
jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

let hold: { promise: Promise<void>; release: () => void } | null = null
const roots = []

function HydratesAfterTheSwitch({ children }) {
  if (hold) use(hold.promise)
  return children
}

function tree(page) {
  return (
    <Providers>
      <Suspense fallback={null}>
        <HydratesAfterTheSwitch>{page}</HydratesAfterTheSwitch>
      </Suspense>
    </Providers>
  )
}

const HYDRATION_MISMATCH = /hydrat|did not match|didn't match/i

async function hydrateWithStoredLanguage(page, stored: string) {
  const container = document.createElement('div')
  container.innerHTML = renderToString(tree(page))
  document.body.appendChild(container)
  const serverHtml = container.innerHTML

  window.localStorage.setItem('i18nextLng', stored)
  let release
  hold = { promise: new Promise<void>((resolve) => (release = resolve)), release: () => release() }

  const recoverable: string[] = []
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  await act(async () => {
    roots.push(
      hydrateRoot(container, tree(page), {
        onRecoverableError: (error) => recoverable.push(String(error?.message ?? error)),
      })
    )
  })
  await waitFor(() => expect(i18n.language).toBe(stored))
  await act(async () => {
    const pending = hold
    hold = null
    pending.release()
  })
  await act(async () => {})

  const mismatches = [
    ...recoverable,
    ...consoleError.mock.calls.map((args) => args.map(String).join(' ')).filter((line) => HYDRATION_MISMATCH.test(line)),
  ]
  consoleError.mockRestore()
  return { container, serverHtml, mismatches }
}

function LobbyTitleProbe({ commits }) {
  const { t } = useTranslation()
  useEffect(() => {
    commits.count += 1
  })
  return <p>{t('lobby.title')}</p>
}

describe('a stored language and hydration (#1571)', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    document.documentElement.lang = 'en'
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        lobbies: [],
        stats: { totalLobbies: 0, waitingLobbies: 0, playingLobbies: 0, totalPlayers: 0 },
        entries: [],
        hasMore: false,
      }),
    }))
    await i18n.changeLanguage('en')
  })

  afterEach(async () => {
    hold?.release()
    hold = null
    jest.restoreAllMocks()
    await act(async () => roots.splice(0).forEach((root) => root.unmount()))
    document.body.innerHTML = ''
  })

  const text = (locale, key) => key.split('.').reduce((node, part) => node[part], locale)

  it.each([
    ['/lobby', <LobbyListPage key="lobby" />, 'lobby.title', 'lobby.title'],
    ['/games', <GamesClient key="games" games={getCatalogGames()} />, 'games.comingSoon', 'games.comingSoon'],
    ['/leaderboard', <LeaderboardClient key="leaderboard" initial={{ entries: [], hasMore: false }} />, 'leaderboard.hallOfFame', 'leaderboard.hallOfFame'],
    ['/games/yahtzee/lobbies', <YahtzeeLobbiesPage key="yahtzee" />, 'common.loading', 'games.yahtzee.lobbies.title'],
  ])('%s hydrates the English it was served, then shows Norwegian', async (_route, page, servedKey, shownKey) => {
    expect(text(en, shownKey)).not.toBe(text(no, shownKey))

    const { container, serverHtml, mismatches } = await hydrateWithStoredLanguage(page, 'no')

    expect(serverHtml).toContain(text(en, servedKey))
    expect(mismatches).toEqual([])
    await waitFor(() => expect(container.textContent).toContain(text(no, shownKey)))
    expect(container.textContent).not.toContain(text(en, shownKey))
  })

  it('the language badge in the header hydrates as EN, then shows NO', async () => {
    const { container, serverHtml, mismatches } = await hydrateWithStoredLanguage(<LanguageSwitcher />, 'no')

    expect(serverHtml).toMatch(/>EN</)
    expect(mismatches).toEqual([])
    expect(container.innerHTML).toMatch(/>NO</)
  })

  it('commits an English visitor once: no update after hydration', async () => {
    const commits = { count: 0 }
    const { mismatches } = await hydrateWithStoredLanguage(<LobbyTitleProbe commits={commits} />, 'en')

    expect(mismatches).toEqual([])
    expect(commits.count).toBe(1)
  })
})
