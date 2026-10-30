import type { ComponentType } from 'react'
import { renderToString } from 'react-dom/server'

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

// The localized pages render these same components (app/localized-game-page.tsx).
const PAGES: [string, ComponentType][] = [
  ['alias', AliasDetailContent],
  ['checkers', CheckersDetailContent],
  ['connect-four', ConnectFourDetailContent],
  ['liars-party', LiarsPartyDetailContent],
  ['ludo', LudoDetailContent],
  ['memory', MemoryDetailContent],
  ['rock-paper-scissors', RockPaperScissorsDetailContent],
  ['sketch-and-guess', SketchAndGuessDetailContent],
  ['spy', SpyDetailContent],
  ['tic-tac-toe', TicTacToeDetailContent],
  ['yahtzee', YahtzeeDetailContent],
]

function serverHtml(Content: ComponentType): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderToString(<Content />)
  return root
}

function preloadsFor(root: HTMLElement, file: string): Element[] {
  return Array.from(root.querySelectorAll('link[rel="preload"][as="image"]')).filter((link) =>
    decodeURIComponent(link.getAttribute('imagesrcset') ?? link.getAttribute('href') ?? '').includes(`/screenshots/${file}`)
  )
}

// #1565: the hero frame is the page's largest paint, so it is fetched from the head in either theme.
describe('game page hero frame in the server HTML', () => {
  it.each(PAGES)('/games/%s: both frames load eagerly', (_slug, Content) => {
    const frames = Array.from(serverHtml(Content).querySelectorAll('img[data-theme-shot]'))

    expect(frames.map((img) => img.getAttribute('data-theme-shot')).sort()).toEqual(['dark', 'light'])
    for (const img of frames) expect(img.getAttribute('loading')).not.toBe('lazy')
  })

  it.each(PAGES)('/games/%s: the light and the dark frame are both preloaded', (slug, Content) => {
    const root = serverHtml(Content)

    expect(preloadsFor(root, `${slug}-desktop.png`)).toHaveLength(1)
    expect(preloadsFor(root, `${slug}-desktop-dark.png`)).toHaveLength(1)
  })
})
