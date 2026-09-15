import { render } from '@testing-library/react'
import Scorecard from '@/components/Scorecard'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

jest.mock('@/lib/sounds', () => ({
  sounds: { play: jest.fn() },
}))

const base = {
  scorecard: {},
  currentDice: [1, 2, 3, 4, 5],
  onSelectCategory: jest.fn(),
  canSelectCategory: false,
  isCurrentPlayer: false,
}

/**
 * #906: at 844x390 the pinned TOTAL bar sat on the last visible category row
 * and sliced its subline flat, which reads as damage rather than as a list
 * that continues. `.scorecard-scroll` is what stops that — bottom padding plus
 * a fade whose zone is that padding — so every pane that scrolls under the bar
 * has to carry it, including one added later.
 */
describe('Scorecard scroll panes (#906)', () => {
  it('gives every scrolling category pane the fade that keeps the TOTAL bar off its last row', () => {
    const { container } = render(<Scorecard {...base} />)
    const scrollPanes = container.querySelectorAll('.overflow-y-auto')

    expect(scrollPanes.length).toBeGreaterThan(0)
    for (const pane of scrollPanes) {
      expect(pane.classList.contains('scorecard-scroll')).toBe(true)
    }
  })

  it('still has a scrolling pane in short mode, where only the lower section renders', () => {
    const { container } = render(<Scorecard {...base} mode="short" />)
    const scrollPanes = container.querySelectorAll('.overflow-y-auto')

    expect(scrollPanes).toHaveLength(1)
    expect(scrollPanes[0].classList.contains('scorecard-scroll')).toBe(true)
  })
})
