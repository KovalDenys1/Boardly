/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import LobbyInfo from '@/app/(site)/lobby/[code]/components/LobbyInfo'
import { fontSizePx, guaranteedPx } from '../fixtures/tailwind-size'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/hooks/useInviteShare', () => ({ useInviteShare: () => jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => {
  const { englishT } = require('../fixtures/english-t')
  return { useTranslation: () => ({ t: englishT }) }
})

function renderInfo(lobby: { code: string; name: string; gameType: string }) {
  return render(
    <LobbyInfo
      lobby={{ isPrivate: false, ...lobby } as never}
      game={{ status: 'waiting' } as never}
      onLeave={() => {}}
    />
  )
}

describe('waiting room heading (#1563)', () => {
  it('names a board game and the code in the heading', () => {
    renderInfo({ code: '4821', name: 'Lobby 4821', gameType: 'connect_four' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Connect Four · 4821')
  })

  it('names a social game instead of "Lobby"', () => {
    renderInfo({ code: '1234', name: 'Lobby 1234', gameType: 'guess_the_spy' })
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Guess the Spy · 1234')
    expect(heading.textContent).not.toMatch(/^Lobby\b/)
  })

  it('names the game for a Quick Play lobby too, and keeps a name the host typed', () => {
    const { unmount } = renderInfo({ code: '5093', name: 'Quick Play 5093', gameType: 'yahtzee' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Yahtzee · 5093')
    expect(screen.queryByText('Quick Play 5093')).toBeNull()
    unmount()

    renderInfo({ code: '7777', name: 'Friday crew', gameType: 'alias' })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Alias · 7777')
    expect(screen.getByText('Friday crew')).toBeInTheDocument()
  })
})

describe('waiting room breadcrumb (#1563)', () => {
  it('links Home, Games and the game at 12px or more with 24px targets', () => {
    renderInfo({ code: '4821', name: 'Lobby 4821', gameType: 'connect_four' })
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    const links = within(nav).getAllByRole('link')

    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Home', '/'],
      ['Games', '/games'],
      ['Connect Four', '/games/connect-four/lobbies'],
    ])
    for (const link of links) {
      expect(fontSizePx(link)).toBeGreaterThanOrEqual(12)
      expect(guaranteedPx(link, 'height')).toBeGreaterThanOrEqual(24)
      expect(guaranteedPx(link, 'width')).toBeGreaterThanOrEqual(24)
    }
  })

  it('never cuts the game name: the crumbs wrap instead of truncating', () => {
    renderInfo({ code: '4821', name: 'Lobby 4821', gameType: 'liars_party' })
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    const gameLink = within(nav).getByRole('link', { name: "Liar's Party" })

    for (let node: Element | null = gameLink; node && node !== nav.parentElement; node = node.parentElement) {
      expect(node.className).not.toMatch(/\btruncate\b|\bwhitespace-nowrap\b|\boverflow-hidden\b/)
    }
  })

  it('lets the toolbar drop below the crumbs on a narrow phone instead of squeezing them into a column', () => {
    renderInfo({ code: '4821', name: 'Lobby 4821', gameType: 'connect_four' })
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    const row = nav.parentElement as HTMLElement

    expect(row.classList.contains('flex-wrap')).toBe(true)
    // flex-1 has a zero basis, so the crumbs never claim the width that would make the buttons wrap.
    expect(nav.classList.contains('flex-1')).toBe(false)
    expect(Array.from(nav.classList).some((c) => /^basis-/.test(c))).toBe(true)
  })
})
