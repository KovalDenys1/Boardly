/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import MemoryGameBoard from '@/app/lobby/[code]/components/MemoryGameBoard'
import { MemoryGame, type MemoryGameData } from '@/lib/games/memory-game'
import { MOBILE_MAX_MEDIA_QUERY, PHONE_LANDSCAPE_MEDIA_QUERY } from '@/lib/responsive-tokens'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: { error: jest.fn(), success: jest.fn() },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(() => Promise.resolve({ ok: true, json: async () => ({}) })),
}))

jest.mock('@/lib/sounds', () => ({
  sounds: { play: jest.fn() },
}))

jest.mock('@/lib/analytics', () => ({
  trackDiscordCta: jest.fn(),
  trackSignupPrompt: jest.fn(),
  trackPushPrompt: jest.fn(),
}))

jest.mock('@/hooks/useInviteShare', () => ({
  useInviteShare: () => jest.fn(),
}))

/**
 * Players.id is a cuid in this database, not a uuid, and the seat ids the client
 * matches on are the Users ids – a guest's is the `guest-<uuid>` string the guest
 * session mints. Fixtures that use neither shape prove nothing about the matching
 * this component does.
 */
const HUMAN_USER_ID = 'guest-4d0bbf27-1f70-4f4a-a0d9-3f4f0a4f2a11'
const BOT_USER_ID = 'cmuabf2em0004d2siqxt2ythn'

/**
 * A finished board straight out of the engine, so the shape is the one the lobby
 * page actually receives rather than one written to suit the assertion.
 */
function finishedMemoryState() {
  const engine = new MemoryGame('cmuabzhpu000fyosihrvaoydp', { maxPlayers: 4, minPlayers: 2 })
  engine.addPlayer({ id: HUMAN_USER_ID, name: 'Denys', score: 0 })
  engine.addPlayer({ id: BOT_USER_ID, name: 'Botty', score: 0 })
  engine.startGame()

  const state = engine.getState() as unknown as {
    status: string
    currentPlayerIndex: number
    players: { id: string; name: string; score?: number }[]
    lastMoveAt?: number
    data: MemoryGameData
  }

  for (const card of state.data.cards) {
    card.isMatched = true
    card.isFlipped = true
  }
  state.data.scores = { [HUMAN_USER_ID]: 5, [BOT_USER_ID]: 3 }
  state.data.winnerId = HUMAN_USER_ID
  state.status = 'finished'
  return state
}

function finishedBoardElement() {
  const state = finishedMemoryState()
  return (
    <MemoryGameBoard
      gameId="cmuabzhpu000fyosihrvaoydp"
      lobbyCode="9952"
      state={state}
      players={[
        { id: 'cmuac0zq1001lyosiuhb5qhlv', userId: HUMAN_USER_ID, score: 5, name: 'Denys' },
        { id: 'cmuac100b001oyosi92tcuxv2', userId: BOT_USER_ID, score: 3, name: 'Botty' },
      ]}
      currentUserId={HUMAN_USER_ID}
      canStartGame
      isGuest
      registerUrl="/auth/register?returnUrl=%2Flobby%2F9952"
    />
  )
}

function renderFinishedBoard() {
  return render(finishedBoardElement())
}

type Layout = 'desktop' | 'landscape' | 'mobile'

/**
 * The element each layout's subtree hangs off, and the width x height at which
 * app/globals.css leaves it visible.
 *
 * `.game-landscape-layout` is `display: none` outside
 * `(max-width: 1023px) and (orientation: landscape)` (globals.css:1933/1934),
 * `.memory-desktop-layout` is hidden with `!important` below 1024px
 * (globals.css:2923), and `.memory-mobile-layout` is hidden with `!important`
 * inside the landscape query (globals.css:2939). So at 844x390 the only tree a
 * player can see is the landscape one, and an overlay mounted in either of the
 * others is an overlay nobody gets - no result screen, no Play Again.
 */
const LAYOUT_TREES: Record<Layout, { selector: string; viewport: string }> = {
  desktop: { selector: '.memory-desktop-layout', viewport: '1280x900' },
  landscape: { selector: '.game-landscape-layout', viewport: '844x390' },
  mobile: { selector: '.memory-mobile-layout', viewport: '390x844' },
}

/** Drives the two media queries the stylesheet switches the three layouts on. */
function setViewport(layout: Layout) {
  const matchesFor = (query: string) => {
    if (query === PHONE_LANDSCAPE_MEDIA_QUERY) return layout === 'landscape'
    if (query === MOBILE_MAX_MEDIA_QUERY) return layout !== 'desktop'
    return false
  }
  ;(window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
    matches: matchesFor(query),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })
}

/**
 * #1052. MemoryGameBoard renders a desktop tree, a phone-landscape tree and a
 * mobile-tab tree in one component and hides two of them with `display: none`.
 * That hides pixels and nothing else – React mounts all three and runs all three
 * sets of effects. The result overlay carries the after-game block, whose nudges
 * report `push_prompt_shown` and `signup_prompt shown` on mount, so a finished
 * Memory game sent three of each. Memory is the most played game on the site
 * (131 games in 30 days), so that is the push funnel's largest single input.
 *
 * Measured live on 2026-09-20 in a Memory game against an Easy bot at 1280x900:
 * `document.querySelectorAll('.memory-tile').length` came back 48 for a 16-card
 * easy board – three copies of the same board, and of everything in it.
 */
describe('MemoryGameBoard result overlay (#1052)', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    ;(window as unknown as { matchMedia: unknown }).matchMedia = originalMatchMedia
  })

  it.each(Object.keys(LAYOUT_TREES) as Layout[])(
    'mounts one result overlay, in the tree %s can see, and no other',
    async (layout) => {
      setViewport(layout)
      const { container } = renderFinishedBoard()
      await act(async () => {
        await Promise.resolve()
      })

      // The three board trees are all still there – this is not a test that
      // passes because someone deleted two layouts.
      expect(container.querySelectorAll('.memory-grid').length).toBe(3)

      const overlays = container.querySelectorAll('[data-testid="game-result-overlay"]')
      expect(overlays.length).toBe(1)
      expect(container.querySelectorAll('[data-testid="after-game-actions"]').length).toBe(1)

      // Counting is not enough: one overlay in the wrong tree is a player at
      // this viewport with no result screen at all. Pin which tree it is in,
      // and that it is in neither of the two the stylesheet has hidden.
      const overlay = overlays[0]
      for (const [candidate, { selector, viewport }] of Object.entries(LAYOUT_TREES)) {
        const inThisTree = overlay.closest(selector) !== null
        expect({ layout, candidate, viewport, inThisTree }).toEqual({
          layout,
          candidate,
          viewport,
          inThisTree: candidate === layout,
        })
      }
    }
  )

  it('draws no overlay in the server render, where no layout is knowable', () => {
    // The server render and the first client render have to agree, and guessing
    // desktop there would mount the hidden desktop overlay on a phone for one
    // commit – another mount, and another pair of beacons. Effects do not run
    // here, which is precisely the case the hook's null return covers.
    setViewport('mobile')
    const html = renderToStaticMarkup(finishedBoardElement())

    expect(html).toContain('memory-grid')
    expect(html).not.toContain('game-result-overlay')
  })
})
