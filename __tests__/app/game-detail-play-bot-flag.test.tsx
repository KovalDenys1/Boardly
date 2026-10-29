import { act, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'

import ConnectFourPage from '@/app/(site)/games/connect-four/page'
import YahtzeePage from '@/app/(site)/games/yahtzee/page'
import AliasPage from '@/app/(site)/games/alias/page'
import SpyPage from '@/app/(site)/games/spy/page'
import LiarsPartyPage from '@/app/(site)/games/liars-party/page'
import SketchAndGuessPage from '@/app/(site)/games/sketch-and-guess/page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

const pushMock = jest.fn()
const setGuestModeMock = jest.fn()

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }))
jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({ isGuest: false, setGuestMode: setGuestModeMock }),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: jest.fn() }),
  usePathname: () => '/games',
}))
jest.mock('@/lib/fetch-with-guest', () => ({
  ...jest.requireActual('@/lib/fetch-with-guest'),
  fetchWithGuest: jest.fn(),
}))
jest.mock('@/lib/analytics', () => ({ trackGameStarted: jest.fn() }))
jest.mock('@/contexts/OnboardingContext', () => ({ useOnboarding: () => ({ completeOnboarding: jest.fn() }) }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))
jest.mock('@/app/(site)/games/components/GameScreenshot', () => ({
  __esModule: true,
  default: () => null,
  hasScreenshot: () => false,
}))

/** The detail pages a clip link can reach, through the one shared Play vs Bot button (#1541). */
describe('/games/<slug>?play=bot', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
    setGuestModeMock.mockReset().mockResolvedValue(undefined)
    ;(fetchWithGuest as jest.Mock).mockReset().mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url === '/api/quick-play' ? { lobbyCode: 'BOT1', lobbyId: 'lobby-bot1', isNew: true } : { game: { players: [] } },
    }))
  })

  afterAll(() => {
    window.history.replaceState(null, '', '/')
  })

  it.each([
    ['connect-four', 'connect_four', ConnectFourPage],
    ['yahtzee', 'yahtzee', YahtzeePage],
  ] as [string, string, ComponentType][])('starts a Medium bot game from /games/%s', async (slug, gameType, Page) => {
    window.history.replaceState(null, '', `/games/${slug}?utm_campaign=${slug}-trap&play=bot`)
    render(<Page />)

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lobby/BOT1'))
    const quickPlay = (fetchWithGuest as jest.Mock).mock.calls.find(([url]) => url === '/api/quick-play')
    expect(JSON.parse(quickPlay[1].body)).toEqual({ gameType, difficulty: 'medium', forceSolo: true })
  })

  it.each([
    ['alias', AliasPage],
    ['spy', SpyPage],
    ['liars-party', LiarsPartyPage],
    ['sketch-and-guess', SketchAndGuessPage],
  ] as [string, ComponentType][])('shows /games/%s as it is today: a game without bots ignores the flag', async (slug, Page) => {
    window.history.replaceState(null, '', `/games/${slug}?utm_campaign=${slug}&play=bot`)
    render(<Page />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(fetchWithGuest).not.toHaveBeenCalled()
    expect(setGuestModeMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    expect(screen.queryByText('quickPlay.playVsBot', { exact: false })).toBeNull()
  })
})
