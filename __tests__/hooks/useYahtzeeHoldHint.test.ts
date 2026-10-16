import { renderHook } from '@testing-library/react'
import { useYahtzeeHoldHint } from '@/hooks/useYahtzeeHoldHint'

type Props = { myTurn: boolean; rollsLeft: number; heldCount: number }

function setPointer(coarse: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }))
}

const render = (initialProps: Props) => renderHook((props: Props) => useYahtzeeHoldHint(props), { initialProps })

describe('useYahtzeeHoldHint', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setPointer(true)
  })

  it('shows on a touch screen after the first roll, not before it', () => {
    const { result, rerender } = render({ myTurn: true, rollsLeft: 3, heldCount: 0 })
    expect(result.current).toBe(false)
    rerender({ myTurn: true, rollsLeft: 2, heldCount: 0 })
    expect(result.current).toBe(true)
  })

  it('goes for good once a die is held', () => {
    const { result, rerender } = render({ myTurn: true, rollsLeft: 2, heldCount: 0 })
    rerender({ myTurn: true, rollsLeft: 2, heldCount: 1 })
    rerender({ myTurn: true, rollsLeft: 1, heldCount: 0 })
    expect(result.current).toBe(false)
    expect(window.localStorage.getItem('boardly_yz_hold_hint_seen')).toBe('1')
  })

  it('goes for good after the first turn ends, held or not', () => {
    const { result, rerender } = render({ myTurn: true, rollsLeft: 2, heldCount: 0 })
    rerender({ myTurn: false, rollsLeft: 3, heldCount: 0 })
    rerender({ myTurn: true, rollsLeft: 2, heldCount: 0 })
    expect(result.current).toBe(false)
  })

  it('never shows with a mouse', () => {
    setPointer(false)
    const { result } = render({ myTurn: true, rollsLeft: 2, heldCount: 0 })
    expect(result.current).toBe(false)
  })
})
