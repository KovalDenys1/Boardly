/**
 * @jest-environment jsdom
 */
import { createElement } from 'react'
import { act, renderHook } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useYahtzeeResultsHold } from '@/app/lobby/[code]/hooks/useYahtzeeResultsHold'

/**
 * #1052, the Yahtzee half. The ticket's acceptance box asks for "a test that
 * fails if a game page mounts the block more than once", and names
 * `YahtzeeResults` in `LobbyPageClient.tsx` as having the same double-mount shape
 * as Memory's overlay.
 *
 * `LobbyPageClient` renders `YahtzeeResults` from two different places: the held
 * full-screen block at LobbyPageClient.tsx:1992, and the in-game shell's own
 * finished branch at :2167. They are in different subtrees, so the page moving
 * from one to the other is an unmount and a mount - and `AfterGameActions` inside
 * reports `push_prompt_shown` and `signup_prompt shown` on mount, which is the
 * overcount the ticket is about.
 *
 * `shouldShowHeldYahtzeeResults` is what picks between them, so this suite pins
 * it: it has to be true on the very first render in which the game reads as
 * finished, before any effect has run, and stay true until the hold is released.
 * A single flip of that value across the finish is one extra mount.
 */
describe('useYahtzeeResultsHold (#1052)', () => {
  const GAME_ID = 'cmuabzhpu000fyosihrvaoydp'

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('shows the held results on the very first finished render, before any effect runs', () => {
    // Rendered with react-dom/server, where effects never run at all. That is the
    // render the old code got wrong: the hold was state written by an effect, so
    // here it was still null, `shouldShowHeldYahtzeeResults` was false and the
    // page rendered YahtzeeResults from the in-game branch - the mount it then
    // threw away when the effect landed.
    function Probe() {
      const hold = useYahtzeeResultsHold(GAME_ID, true)
      return createElement('output', {}, JSON.stringify(hold))
    }

    const html = renderToStaticMarkup(createElement(Probe))
    const firstRender = JSON.parse(
      html.replace(/^<output>/, '').replace(/<\/output>$/, '').replace(/&quot;/g, '"')
    )

    expect(firstRender.showResults).toBe(true)
  })

  it('does not hold the results of a game that is still being played', () => {
    const { result } = renderHook(() => useYahtzeeResultsHold(GAME_ID, false))

    expect(result.current.showResults).toBe(false)
  })

  it('never flips the branch while the results are on screen', () => {
    const seen: boolean[] = []
    const { rerender } = renderHook(
      ({ finished }) => {
        const hold = useYahtzeeResultsHold(GAME_ID, finished)
        seen.push(hold.showResults)
        return hold
      },
      { initialProps: { finished: true } }
    )

    // Everything a finished lobby page does while the results are up: realtime
    // snapshots, heartbeats and timers all re-render it, and the hold effect runs
    // somewhere in there.
    for (let render = 0; render < 5; render++) {
      act(() => {
        jest.advanceTimersByTime(1_000)
      })
      rerender({ finished: true })
    }

    // One `true` per render and no `false` anywhere in between. A single false in
    // this list is the block unmounting and mounting again for one finished game.
    expect(seen.every(Boolean)).toBe(true)
    expect(seen.filter((shown) => !shown)).toEqual([])
  })

  it('keeps the results up however long the player reads them', () => {
    const { result, rerender } = renderHook(
      ({ finished }) => useYahtzeeResultsHold(GAME_ID, finished),
      { initialProps: { finished: true } }
    )

    act(() => {
      jest.advanceTimersByTime(10 * 60_000)
    })
    rerender({ finished: true })
    expect(result.current.showResults).toBe(true)
  })

  it('stays released for that game once the player has left the results', () => {
    const { result, rerender } = renderHook(
      ({ finished }) => useYahtzeeResultsHold(GAME_ID, finished),
      { initialProps: { finished: true } }
    )

    act(() => {
      result.current.release()
    })
    // The engine still reports the same game finished on every later render, so a
    // hold that re-armed here would put the results back over the lobby room.
    rerender({ finished: true })
    expect(result.current.showResults).toBe(false)
  })

  it('releases on request and holds again for the next game', () => {
    const { result, rerender } = renderHook(
      ({ gameId }) => useYahtzeeResultsHold(gameId, true),
      { initialProps: { gameId: GAME_ID } }
    )

    expect(result.current.showResults).toBe(true)
    act(() => {
      result.current.release()
    })
    expect(result.current.showResults).toBe(false)

    // A rematch is a new Games row, and its results are a different screen.
    rerender({ gameId: 'cmub0000000000000000000x' })
    expect(result.current.showResults).toBe(true)
  })
})
