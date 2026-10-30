import { render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'

import AliasDetailContent from '@/app/(site)/games/alias/AliasDetailContent'
import CheckersDetailContent from '@/app/(site)/games/checkers/CheckersDetailContent'
import ConnectFourDetailContent from '@/app/(site)/games/connect-four/ConnectFourDetailContent'
import LiarsPartyDetailContent from '@/app/(site)/games/liars-party/LiarsPartyDetailContent'
import LudoDetailContent from '@/app/(site)/games/ludo/LudoDetailContent'
import MemoryDetailContent from '@/app/(site)/games/memory/MemoryDetailContent'
import RockPaperScissorsDetailContent from '@/app/(site)/games/rock-paper-scissors/RockPaperScissorsDetailContent'
import SketchAndGuessDetailContent from '@/app/(site)/games/sketch-and-guess/SketchAndGuessDetailContent'
import SpyDetailContent from '@/app/(site)/games/spy/SpyDetailContent'
import TicTacToeDetailContent from '@/app/(site)/games/tic-tac-toe/TicTacToeDetailContent'
import YahtzeeDetailContent from '@/app/(site)/games/yahtzee/YahtzeeDetailContent'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }))
jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ isGuest: false, setGuestMode: jest.fn() }) }))
jest.mock('@/contexts/OnboardingContext', () => ({ useOnboarding: () => ({ completeOnboarding: jest.fn() }) }))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/games',
}))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

const WITH_BOT: [string, ComponentType][] = [
  ['checkers', CheckersDetailContent],
  ['connect-four', ConnectFourDetailContent],
  ['ludo', LudoDetailContent],
  ['memory', MemoryDetailContent],
  ['rock-paper-scissors', RockPaperScissorsDetailContent],
  ['tic-tac-toe', TicTacToeDetailContent],
  ['yahtzee', YahtzeeDetailContent],
]

const WITHOUT_BOT: [string, ComponentType][] = [
  ['alias', AliasDetailContent],
  ['liars-party', LiarsPartyDetailContent],
  ['sketch-and-guess', SketchAndGuessDetailContent],
  ['spy', SpyDetailContent],
]

function heroPrimaries(): Element[] {
  const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
  return Array.from(hero.querySelectorAll('.bd-btn-primary'))
}

function browseGames(): HTMLElement {
  return screen.getByRole('link', { name: 'home.browseGames' })
}

// #1565: the first action on a game page is the strongest one.
describe('game detail hero actions', () => {
  it.each(WITH_BOT)('/games/%s: Play vs Bot is the one filled primary, Browse Games a secondary', (_slug, Content) => {
    render(<Content />)

    const bot = screen.getByRole('button', { name: /quickPlay\.playVsBot/ })
    expect(bot).toHaveClass('bd-btn', 'bd-btn-primary')
    expect(heroPrimaries()).toEqual([bot])
    expect(browseGames()).toHaveClass('bd-btn-ghost')
    expect(browseGames()).not.toHaveClass('bd-btn-primary')
  })

  it.each(WITHOUT_BOT)('/games/%s: without a bot, Play Now is the one filled primary', (_slug, Content) => {
    render(<Content />)

    expect(screen.queryByRole('button', { name: /quickPlay\.playVsBot/ })).toBeNull()
    const primaries = heroPrimaries()
    expect(primaries).toHaveLength(1)
    expect(primaries[0]).toHaveTextContent('games.playNow')
    expect(browseGames()).toHaveClass('bd-btn-ghost')
  })
})
