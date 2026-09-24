import { act, renderHook } from '@testing-library/react'
import { isFreshKey, useFreshKey } from '@/hooks/useFreshKey'

describe('isFreshKey', () => {
  it('is never fresh without a key', () => {
    expect(isFreshKey(null, 'a', null)).toBe(false)
    expect(isFreshKey(undefined, undefined, null)).toBe(false)
  })
  it('treats the first key seen as loaded state, not a move', () => {
    expect(isFreshKey('a', 'a', null)).toBe(false)
  })
  it('is fresh for a new key until it is settled', () => {
    expect(isFreshKey('b', 'a', null)).toBe(true)
    expect(isFreshKey('b', 'a', 'b')).toBe(false)
  })
})

describe('useFreshKey', () => {
  it('ignores the snapshot, flags the next key, and settles it', () => {
    const { result, rerender } = renderHook(({ k }: { k: string | null }) => useFreshKey(k), {
      initialProps: { k: null as string | null },
    })
    expect(result.current.fresh).toBe(false)
    rerender({ k: '1:100' })
    expect(result.current.fresh).toBe(false)
    rerender({ k: '2:200' })
    expect(result.current.fresh).toBe(true)
    act(() => result.current.settle())
    expect(result.current.fresh).toBe(false)
    rerender({ k: '3:300' })
    expect(result.current.fresh).toBe(true)
  })
})
