import { act, fireEvent, render, screen } from '@testing-library/react'
import YahtzeeTileGrid from '@/components/yahtzee/YahtzeeTileGrid'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

jest.mock('@/lib/sounds', () => ({
  sounds: { play: jest.fn() },
}))

const mockupCard = { ones: 3, twos: 6, fours: 12, onePair: 10, fullHouse: 25, smallStraight: 30 }
const mockupDice = [3, 3, 3, 5, 6]

function tile(container: HTMLElement, category: string) {
  return container.querySelector(`[data-category="${category}"]`) as HTMLElement
}

describe('YahtzeeTileGrid (#1187)', () => {
  it('renders 15 tiles in classic mode and 9 in short mode', () => {
    const { container, rerender } = render(
      <YahtzeeTileGrid scorecard={{}} mode="classic" dice={mockupDice} canScore onScore={jest.fn()} />,
    )
    expect(container.querySelectorAll('.yz-tile')).toHaveLength(15)
    rerender(<YahtzeeTileGrid scorecard={{}} mode="short" dice={mockupDice} canScore onScore={jest.fn()} />)
    expect(container.querySelectorAll('.yz-tile')).toHaveLength(9)
  })

  it('shows exactly one best tile and one best signal on screen', () => {
    const { container } = render(
      <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={jest.fn()} />,
    )
    const best = container.querySelectorAll('.yz-tile--best')
    expect(best).toHaveLength(1)
    expect(best[0].getAttribute('data-category')).toBe('threeOfKind')
    expect(tile(container, 'chance').classList.contains('yz-tile--best')).toBe(false)
    expect(screen.getAllByText('yahtzee.ui.best')).toHaveLength(1)
  })

  it('scores a tile with points on the first tap', () => {
    const onScore = jest.fn()
    const { container } = render(
      <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={onScore} />,
    )
    fireEvent.click(tile(container, 'threes'))
    expect(onScore).toHaveBeenCalledWith('threes')
  })

  it('asks for a second tap before scoring 0', () => {
    const onScore = jest.fn()
    const { container } = render(
      <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={onScore} />,
    )
    const yahtzee = tile(container, 'yahtzee')
    expect(yahtzee.getAttribute('data-state')).toBe('zero')
    fireEvent.click(yahtzee)
    expect(onScore).not.toHaveBeenCalled()
    expect(yahtzee.classList.contains('yz-tile--armed')).toBe(true)
    fireEvent.click(yahtzee)
    expect(onScore).toHaveBeenCalledWith('yahtzee')
  })

  it('disarms a 0 tile when the roll changes', () => {
    const onScore = jest.fn()
    const { container, rerender } = render(
      <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={onScore} />,
    )
    fireEvent.click(tile(container, 'yahtzee'))
    rerender(<YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={[3, 3, 3, 5, 5]} canScore onScore={onScore} />)
    fireEvent.click(tile(container, 'yahtzee'))
    expect(onScore).not.toHaveBeenCalled()
  })

  it('keeps a 0 tile armed until the roll or the turn changes, with no timeout', () => {
    jest.useFakeTimers()
    try {
      const onScore = jest.fn()
      const { container } = render(
        <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={onScore} />,
      )
      fireEvent.click(tile(container, 'yahtzee'))
      act(() => { jest.advanceTimersByTime(60_000) })
      expect(tile(container, 'yahtzee').classList.contains('yz-tile--armed')).toBe(true)
      fireEvent.click(tile(container, 'yahtzee'))
      expect(onScore).toHaveBeenCalledWith('yahtzee')
    } finally {
      jest.useRealTimers()
    }
  })

  it('disarms a 0 tile when the turn passes', () => {
    const { container, rerender } = render(
      <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={jest.fn()} />,
    )
    fireEvent.click(tile(container, 'yahtzee'))
    rerender(<YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore={false} onScore={jest.fn()} />)
    expect(tile(container, 'yahtzee').classList.contains('yz-tile--armed')).toBe(false)
  })

  it('announces the armed 0 tile in a live region', () => {
    const { container } = render(
      <YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={jest.fn()} />,
    )
    const live = container.querySelector('[aria-live="polite"]') as HTMLElement
    expect(live).not.toBeNull()
    expect(live.textContent).toBe('')
    fireEvent.click(tile(container, 'yahtzee'))
    expect(live.textContent).toContain('yahtzee.ui.tileConfirmZeroAria')
  })

  it('offers My card in the in-grid footer that phone landscape shows', () => {
    const onBackToMine = jest.fn()
    const { container } = render(
      <YahtzeeTileGrid
        scorecard={mockupCard}
        mode="classic"
        dice={mockupDice}
        canScore={false}
        onScore={jest.fn()}
        otherPlayerName="Anna"
        onBackToMine={onBackToMine}
      />,
    )
    const back = container.querySelector('.yz-footer--in-grid .yz-footer__back') as HTMLElement
    expect(back).not.toBeNull()
    fireEvent.click(back)
    expect(onBackToMine).toHaveBeenCalledTimes(1)
  })

  it('is read-only on someone else\'s card and names whose it is', () => {
    const onScore = jest.fn()
    const { container } = render(
      <YahtzeeTileGrid
        scorecard={mockupCard}
        mode="classic"
        dice={mockupDice}
        canScore={false}
        onScore={onScore}
        otherPlayerName="Anna"
        onBackToMine={jest.fn()}
      />,
    )
    expect(container.querySelectorAll('button.yz-tile')).toHaveLength(0)
    expect(container.querySelectorAll('.yz-tile--best')).toHaveLength(0)
    expect(screen.getByTestId('yahtzee-total').textContent).toContain('"player":"Anna"')
  })

  it('footer names the best pick and the total it leads to', () => {
    render(<YahtzeeTileGrid scorecard={mockupCard} mode="classic" dice={mockupDice} canScore onScore={jest.fn()} />)
    const footer = screen.getByTestId('yahtzee-total').textContent ?? ''
    expect(footer).toContain('yahtzee.ui.pickArrow')
    expect(footer).toContain('106')
  })
})
