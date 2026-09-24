import { render, screen } from '@testing-library/react'
import ScorePop, { SCORE_POP_CLASS } from '@/components/game-chrome/ScorePop'

describe('ScorePop (#1111)', () => {
  it('does not pop the first score', () => {
    render(<ScorePop value="0:0" data-testid="score">0 : 0</ScorePop>)
    expect(screen.getByTestId('score').className).not.toContain(SCORE_POP_CLASS)
  })

  it('remounts with the pop class when the value changes, and not on a re-render', () => {
    const { rerender } = render(<ScorePop value="0:0" data-testid="score" style={{ fontSize: 28 }}>0 : 0</ScorePop>)
    const first = screen.getByTestId('score')
    rerender(<ScorePop value="0:0" data-testid="score" style={{ fontSize: 28 }}>0 : 0</ScorePop>)
    expect(screen.getByTestId('score')).toBe(first)

    rerender(<ScorePop value="1:0" data-testid="score" style={{ fontSize: 28 }}>1 : 0</ScorePop>)
    const popped = screen.getByTestId('score')
    expect(popped).not.toBe(first)
    expect(popped.className).toContain(SCORE_POP_CLASS)
    expect(popped.style.fontSize).toBe('28px')
    expect(popped.textContent).toBe('1 : 0')
  })

  it('keeps a caller className alongside the pop class', () => {
    const { rerender } = render(<ScorePop value={1} className="extra" data-testid="score">1</ScorePop>)
    expect(screen.getByTestId('score').className).toBe('extra')
    rerender(<ScorePop value={2} className="extra" data-testid="score">2</ScorePop>)
    expect(screen.getByTestId('score').className).toBe(`${SCORE_POP_CLASS} extra`)
  })
})
