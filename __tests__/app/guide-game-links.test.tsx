import type { ComponentType } from 'react'
import { render } from '@testing-library/react'
import { ALL_GUIDES, getGuideGamePath, getGuidesForGame } from '@/lib/guides-catalog'
import { getCatalogAvailableGames } from '@/lib/game-catalog'

// Same reason as guide-faq-schema.test.tsx: the layout ends with an ad slot
// and the site footer, which want a session and a translation context.
jest.mock('@/components/AdSlot', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))

function renderedHrefs(slug: string): string[] {
  const Page = require(`../../app/guides/${slug}/page`).default as ComponentType
  const { container } = render(<Page />)
  return Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
}

/**
 * Seven of twelve guides used to send every link – inline and CTA – to
 * `/games/<slug>/lobbies`, which is noindex and canonicals to the game page,
 * and none to `/games/<slug>` itself. The page with the impressions got no
 * link equity from the pages written about it. The catalog's `game` field is
 * now the one place that says which game a guide teaches, and both the guide
 * and the game page draw their links from it.
 */
describe('guide → game-page links', () => {
  const withGame = ALL_GUIDES.filter((guide) => guide.game)
  const withoutGame = ALL_GUIDES.filter((guide) => !guide.game)

  it('files every how-to and strategy guide under a catalog game, and no best-of list', () => {
    for (const guide of withGame) expect(['how-to-play', 'strategy']).toContain(guide.category)
    for (const guide of withoutGame) expect(guide.category).toBe('best-of')
    // Seven how-to guides and the one strategy guide still standing – the
    // Yahtzee strategy guide folded into /games/yahtzee in #1077.
    expect(withGame.length).toBeGreaterThanOrEqual(8)
  })

  it('resolves every game to a detail path that is in the available catalog', () => {
    const detailPaths = new Set(getCatalogAvailableGames().map((game) => game.route!.replace(/\/lobbies$/, '')))
    for (const guide of withGame) {
      const path = getGuideGamePath(guide)
      expect(path).not.toBeNull()
      expect(path).not.toMatch(/\/lobbies$/)
      expect(detailPaths.has(path!)).toBe(true)
    }
    for (const guide of withoutGame) expect(getGuideGamePath(guide)).toBeNull()
  })

  it.each(withGame.map((guide) => guide.slug))('%s links its game page at least twice', (slug) => {
    const guide = ALL_GUIDES.find((entry) => entry.slug === slug)!
    const path = getGuideGamePath(guide)!
    const hrefs = renderedHrefs(slug)
    expect(hrefs.filter((href) => href === path).length).toBeGreaterThanOrEqual(2)
  })

  it.each([
    ['how-to-play-connect-four-online', 'connect-four-strategy-guide'],
  ])('%s and %s link each other in prose, not only under "More guides"', (howTo, strategy) => {
    // `related` renders one link per guide; a second one has to come from the body.
    expect(renderedHrefs(howTo).filter((href) => href === `/guides/${strategy}`).length).toBeGreaterThanOrEqual(2)
    expect(renderedHrefs(strategy).filter((href) => href === `/guides/${howTo}`).length).toBeGreaterThanOrEqual(2)
  })
})

describe('game page → guide links', () => {
  it('lists every guide about a game, how-to before strategy', () => {
    // Yahtzee's strategy guide is now the #strategy section of the game page (#1077).
    const yahtzee = getGuidesForGame('yahtzee').map((guide) => guide.slug)
    expect(yahtzee).toEqual(['how-to-play-yahtzee-online'])
    expect(getGuidesForGame('connect-four').map((guide) => guide.category)).toEqual(['how-to-play', 'strategy'])
    expect(getGuidesForGame('liars-party')).toEqual([])
  })
})

describe('the folded Yahtzee strategy guide (#1077)', () => {
  it('sends the how-to guide\'s strategy pointer to the game page section', () => {
    expect(renderedHrefs('how-to-play-yahtzee-online')).toContain('/games/yahtzee#strategy')
  })
})
