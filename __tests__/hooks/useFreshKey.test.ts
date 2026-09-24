import { act, renderHook } from '@testing-library/react'
import { FRESH_KEY_NOT_LOADED, isFreshKey, useFreshKey } from '@/hooks/useFreshKey'

type Key = string | null | undefined

const render = (initial: Key) =>
  renderHook(({ k }: { k: Key }) => useFreshKey(k), { initialProps: { k: initial } })

describe('isFreshKey', () => {
  it('is never fresh without a key, or before anything has loaded', () => {
    expect(isFreshKey(null, 'a', null)).toBe(false)
    expect(isFreshKey(undefined, null, null)).toBe(false)
    expect(isFreshKey('a', FRESH_KEY_NOT_LOADED, null)).toBe(false)
  })
  it('treats the key that loaded in as state, not a move', () => {
    expect(isFreshKey('a', 'a', null)).toBe(false)
  })
  it('is fresh for a new key until it is settled', () => {
    expect(isFreshKey('b', 'a', null)).toBe(true)
    expect(isFreshKey('b', 'a', 'b')).toBe(false)
    // An empty board loaded: its first move is new.
    expect(isFreshKey('1:100', null, null)).toBe(true)
  })
})

describe('useFreshKey', () => {
  it('animates move 1 of a game that loaded empty', () => {
    const { result, rerender } = render(undefined)
    rerender({ k: null })
    expect(result.current.fresh).toBe(false)
    rerender({ k: '1:100' })
    expect(result.current.fresh).toBe(true)
  })

  it('animates move 1 when the page mounts with the empty game already there', () => {
    const { result, rerender } = render(null)
    rerender({ k: '1:100' })
    expect(result.current.fresh).toBe(true)
  })

  it('does not replay the last move of a game loaded mid-play, but animates the next', () => {
    const { result, rerender } = render(undefined)
    rerender({ k: '3:300' })
    expect(result.current.fresh).toBe(false)
    rerender({ k: '4:400' })
    expect(result.current.fresh).toBe(true)
  })

  it('stays settled once the animation has played', () => {
    const { result, rerender } = render(null)
    rerender({ k: '1:100' })
    act(() => result.current.settle())
    expect(result.current.fresh).toBe(false)
    rerender({ k: '2:200' })
    expect(result.current.fresh).toBe(true)
  })
})
