import { act, renderHook } from '@testing-library/react'
import { shouldHoldChange, useHeldValue } from '@/hooks/useHeldValue'

type Props = { scores: Record<string, number>; rounds: number; holdMs?: number; ready?: boolean }

const render = (initial: Props) =>
  renderHook(
    ({ scores, rounds, holdMs = 1100, ready = true }: Props) =>
      useHeldValue(scores, JSON.stringify(scores), rounds, holdMs, ready),
    { initialProps: initial },
  )

describe('shouldHoldChange', () => {
  it('holds only when a new round was revealed, holding is on and a real value was showing', () => {
    expect(shouldHoldChange(1, 2, 1100)).toBe(true)
    expect(shouldHoldChange(2, 2, 1100)).toBe(false)
    expect(shouldHoldChange(3, 0, 1100)).toBe(false)
    expect(shouldHoldChange(1, 2, 0)).toBe(false)
    expect(shouldHoldChange(0, 3, 1100, false)).toBe(false)
  })
})

describe('useHeldValue', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('keeps the previous score until the reveal has played', () => {
    const { result, rerender } = render({ scores: { a: 0 }, rounds: 0 })
    rerender({ scores: { a: 1 }, rounds: 1 })
    expect(result.current).toEqual({ a: 0 })
    act(() => { jest.advanceTimersByTime(1099) })
    expect(result.current).toEqual({ a: 0 })
    act(() => { jest.advanceTimersByTime(1) })
    expect(result.current).toEqual({ a: 1 })
  })

  it('shows a reset (rematch) at once', () => {
    const { result, rerender } = render({ scores: { a: 2 }, rounds: 3 })
    rerender({ scores: {}, rounds: 0 })
    expect(result.current).toEqual({})
  })

  it('shows every change at once when holding is off (reduced motion)', () => {
    const { result, rerender } = render({ scores: { a: 0 }, rounds: 0, holdMs: 0 })
    rerender({ scores: { a: 1 }, rounds: 1, holdMs: 0 })
    expect(result.current).toEqual({ a: 1 })
  })

  it('shows the first real snapshot at once on a refresh or a join mid-series', () => {
    const { result, rerender } = render({ scores: {}, rounds: 0, ready: false })
    rerender({ scores: { a: 1, b: 1 }, rounds: 2, ready: true })
    expect(result.current).toEqual({ a: 1, b: 1 })
    act(() => { jest.advanceTimersByTime(0) })
    // ...and the next revealed round is held as usual.
    rerender({ scores: { a: 2, b: 1 }, rounds: 3, ready: true })
    expect(result.current).toEqual({ a: 1, b: 1 })
    act(() => { jest.advanceTimersByTime(1100) })
    expect(result.current).toEqual({ a: 2, b: 1 })
  })

  it('holds the first round of a game that loaded at 0:0', () => {
    const { result, rerender } = render({ scores: {}, rounds: 0, ready: false })
    rerender({ scores: {}, rounds: 0, ready: true })
    act(() => { jest.advanceTimersByTime(0) })
    rerender({ scores: { a: 1 }, rounds: 1, ready: true })
    expect(result.current).toEqual({})
  })
})
