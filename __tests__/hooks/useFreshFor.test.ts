import { act, renderHook } from '@testing-library/react'
import { useFreshFor } from '@/hooks/useFreshFor'

type Key = string | null | undefined

const render = (initial: Key, ms = 1000) =>
  renderHook(({ k }: { k: Key }) => useFreshFor(k, ms), { initialProps: { k: initial } })

describe('useFreshFor', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('the key a page loads with is never fresh', () => {
    const { result } = render('1:reveal')
    expect(result.current).toBe(false)
  })

  it('a change is fresh for the window, then settles by itself', () => {
    const { result, rerender } = render('1:claim')
    rerender({ k: '1:reveal' })
    expect(result.current).toBe(true)
    act(() => { jest.advanceTimersByTime(999) })
    expect(result.current).toBe(true)
    act(() => { jest.advanceTimersByTime(1) })
    expect(result.current).toBe(false)
  })

  it('nothing is fresh before the state has loaded, and loading is not a change', () => {
    const { result, rerender } = render(undefined)
    rerender({ k: '2:challenge' })
    expect(result.current).toBe(false)
    rerender({ k: '2:reveal' })
    expect(result.current).toBe(true)
  })
})
