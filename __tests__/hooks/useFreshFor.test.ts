import { act, renderHook } from '@testing-library/react'
import { startedJustNow, useFreshFor, useFreshIds, useFreshOnArrival } from '@/hooks/useFreshFor'

describe('startedJustNow', () => {
  it('is a window either side of now, and nothing without a start', () => {
    expect(startedJustNow(10_000, 12_000, 4000)).toBe(true)
    expect(startedJustNow(14_000, 12_000, 4000)).toBe(true)
    expect(startedJustNow(10_000, 20_000, 4000)).toBe(false)
    expect(startedJustNow(0, 1000, 4000)).toBe(false)
    expect(startedJustNow(undefined, 1000, 4000)).toBe(false)
  })
})

describe('useFreshOnArrival', () => {
  it('a phase the board mounts into is fresh only if it began just now, until settled', () => {
    const recent = renderHook(() => useFreshOnArrival('reveal-1', Date.now() - 500))
    expect(recent.result.current.fresh).toBe(true)
    act(() => recent.result.current.settle())
    expect(recent.result.current.fresh).toBe(false)

    const old = renderHook(() => useFreshOnArrival('reveal-1', Date.now() - 60_000))
    expect(old.result.current.fresh).toBe(false)
  })

  it('a later change is fresh the ordinary way', () => {
    const { result, rerender } = renderHook(({ k }) => useFreshOnArrival(k, Date.now() - 60_000), {
      initialProps: { k: null as string | null },
    })
    rerender({ k: 'reveal-2' })
    expect(result.current.fresh).toBe(true)
  })
})

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

describe('useFreshIds', () => {
  const render = (initial: string[] | undefined) =>
    renderHook(({ ids }: { ids: string[] | undefined }) => useFreshIds(ids), { initialProps: { ids: initial } })

  it('hits the panel mounts with never bounce; a new hit does, once', () => {
    const { result, rerender } = render(['1'])
    expect(result.current.isFresh('1')).toBe(false)
    rerender({ ids: ['1', '2'] })
    expect(result.current.isFresh('2')).toBe(true)
    act(() => result.current.settle('2'))
    // Settled: a tab switch that shows the panel again does not replay it.
    expect(result.current.isFresh('2')).toBe(false)
    expect(result.current.isFresh('1')).toBe(false)
  })

  it('takes the first defined list as the baseline', () => {
    const { result, rerender } = render(undefined)
    rerender({ ids: ['7'] })
    expect(result.current.isFresh('7')).toBe(false)
    rerender({ ids: ['7', '8'] })
    expect(result.current.isFresh('8')).toBe(true)
  })
})
