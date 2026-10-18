import { act, fireEvent, render, screen, within } from '@testing-library/react'
import YahtzeeScoreTable, { type ScoreTablePlayer } from '@/components/yahtzee/YahtzeeScoreTable'
import { playCue } from '@/lib/sound-engine'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn(() => true) }))

const myCard = { ones: 3, twos: 6, fours: 12, onePair: 10, fullHouse: 25, smallStraight: 30 }
const dice = [3, 3, 3, 5, 6]
const me: ScoreTablePlayer = { id: 'me', name: 'Ada', scorecard: myCard }
const bot: ScoreTablePlayer = { id: 'bot', name: 'Dice Strategist', isBot: true, scorecard: { chance: 22 } }

function renderTable(overrides: Partial<React.ComponentProps<typeof YahtzeeScoreTable>> = {}) {
  const props: React.ComponentProps<typeof YahtzeeScoreTable> = {
    players: [bot, me],
    viewerId: 'me',
    currentPlayerId: 'me',
    mode: 'classic',
    dice,
    canScore: true,
    onScore: jest.fn(),
    rollsLeft: 1,
    ...overrides,
  }
  const view = render(<YahtzeeScoreTable {...props} />)
  return { ...view, props, rerenderWith: (next: Partial<typeof props>) => view.rerender(<YahtzeeScoreTable {...props} {...next} />) }
}

const row = (container: HTMLElement, key: string) => container.querySelector(`[data-row="${key}"]`) as HTMLElement
const cells = (container: HTMLElement, key: string) => Array.from(row(container, key).querySelectorAll('[role="cell"]')) as HTMLElement[]
const ghost = (container: HTMLElement, key: string) => row(container, key).querySelector('button[data-category]') as HTMLButtonElement

describe('YahtzeeScoreTable', () => {
  it('has a row per box: nine in short mode, fifteen plus the upper sum and bonus in classic', () => {
    const { container, rerenderWith } = renderTable({ mode: 'short' })
    expect(container.querySelectorAll('.yz-sheet__row--category')).toHaveLength(9)
    expect(row(container, 'sum')).toBeNull()
    rerenderWith({ mode: 'classic' })
    expect(container.querySelectorAll('.yz-sheet__row--category')).toHaveLength(15)
    expect(row(container, 'sum')).not.toBeNull()
    expect(row(container, 'bonus')).not.toBeNull()
  })

  it('puts the viewer’s column first, then everyone else in seat order', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader').slice(1, 3)
    expect(headers[0]).toHaveTextContent('yahtzee.ui.youPill')
    expect(headers[1]).toHaveTextContent('Dice Strategist')
  })

  it('shows the viewer what this roll would score, and opponents a dash', () => {
    const { container } = renderTable()
    const [mine, theirs] = cells(container, 'threes')
    expect(within(mine).getByRole('button')).toHaveTextContent('9')
    expect(within(theirs).queryByRole('button')).toBeNull()
    expect(theirs).toHaveTextContent('–')
    expect(cells(container, 'ones')[0]).toHaveTextContent('3')
    expect(cells(container, 'chance')[1]).toHaveTextContent('22')
  })

  it('marks exactly one best preview, and never on a zero', () => {
    const { container } = renderTable()
    const best = container.querySelectorAll('.yz-ghost--best')
    expect(best).toHaveLength(1)
    expect(best[0].getAttribute('data-category')).toBe('threeOfKind')
    expect(ghost(container, 'yahtzee').classList.contains('yz-ghost--best')).toBe(false)
  })

  it('shows no previews when the viewer cannot score', () => {
    const { container } = renderTable({ canScore: false })
    expect(container.querySelectorAll('.yz-ghost')).toHaveLength(0)
  })

  it('scores a box with points on the first tap', () => {
    const { container, props } = renderTable()
    fireEvent.click(ghost(container, 'threes'))
    expect(props.onScore).toHaveBeenCalledWith('threes')
  })

  it('asks for a second tap before scoring 0, and says so on the row and to screen readers', () => {
    const { container, props } = renderTable()
    const yahtzee = ghost(container, 'yahtzee')
    expect(yahtzee.getAttribute('data-state')).toBe('zero')
    fireEvent.click(yahtzee)
    expect(props.onScore).not.toHaveBeenCalled()
    expect(row(container, 'yahtzee').classList.contains('is-armed')).toBe(true)
    expect(row(container, 'yahtzee')).toHaveTextContent('yahtzee.ui.tapAgainZero')
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('yahtzee.ui.tileConfirmZeroAria')
    fireEvent.click(ghost(container, 'yahtzee'))
    expect(props.onScore).toHaveBeenCalledWith('yahtzee')
  })

  it('ticks ui.select when a 0 is armed, and leaves the score sound to the score itself (#1464)', () => {
    ;(playCue as jest.Mock).mockClear()
    const { container } = renderTable()
    fireEvent.click(ghost(container, 'yahtzee'))
    expect(playCue).toHaveBeenCalledWith('ui.select')
    ;(playCue as jest.Mock).mockClear()
    fireEvent.click(ghost(container, 'yahtzee'))
    fireEvent.click(ghost(container, 'threes'))
    expect(playCue).not.toHaveBeenCalled()
  })

  it('disarms a 0 when the roll changes, so a stale arm never scores', () => {
    const { container, props, rerenderWith } = renderTable()
    fireEvent.click(ghost(container, 'yahtzee'))
    rerenderWith({ dice: [3, 3, 3, 5, 5] })
    fireEvent.click(ghost(container, 'yahtzee'))
    expect(props.onScore).not.toHaveBeenCalled()
  })

  it('tints the column of whoever is playing', () => {
    const { container, rerenderWith } = renderTable()
    expect(cells(container, 'ones')[0].classList.contains('is-current')).toBe(true)
    expect(cells(container, 'ones')[1].classList.contains('is-current')).toBe(false)
    rerenderWith({ currentPlayerId: 'bot', canScore: false })
    expect(cells(container, 'ones')[1].classList.contains('is-current')).toBe(true)
  })

  it('sweeps an opponent’s new box, pops the viewer’s own, and rings each until that player rolls again', () => {
    jest.useFakeTimers()
    try {
      const { container, rerenderWith } = renderTable({ currentPlayerId: 'bot', canScore: false, rollsLeft: 0 })
      const botScored = { ...bot, scorecard: { ...bot.scorecard, fullHouse: 25 } }
      rerenderWith({ players: [botScored, me], currentPlayerId: 'me', canScore: false, rollsLeft: 3 })
      const botFullHouse = cells(container, 'fullHouse')[1]
      expect(botFullHouse.classList.contains('yz-cell--sweep')).toBe(true)
      expect(botFullHouse.classList.contains('yz-cell--last')).toBe(true)

      act(() => { jest.advanceTimersByTime(1000) })
      expect(cells(container, 'fullHouse')[1].classList.contains('yz-cell--sweep')).toBe(false)
      expect(cells(container, 'fullHouse')[1].classList.contains('yz-cell--last')).toBe(true)

      const meScored = { ...me, scorecard: { ...me.scorecard, threes: 9 } }
      rerenderWith({ players: [botScored, meScored], currentPlayerId: 'bot', canScore: false, rollsLeft: 3 })
      expect(cells(container, 'threes')[0].classList.contains('yz-cell--pop')).toBe(true)

      // The bot rolls on its next turn: its ring goes, the viewer's stays.
      rerenderWith({ players: [botScored, meScored], currentPlayerId: 'bot', canScore: false, rollsLeft: 2 })
      expect(cells(container, 'fullHouse')[1].classList.contains('yz-cell--last')).toBe(false)
      expect(cells(container, 'threes')[0].classList.contains('yz-cell--last')).toBe(true)
    } finally {
      jest.useRealTimers()
    }
  })

  it('animates nothing on first render', () => {
    const { container } = renderTable()
    expect(container.querySelectorAll('.yz-cell--pop, .yz-cell--sweep, .yz-cell--last')).toHaveLength(0)
  })

  it('keeps the rule on the box name, described for screen readers and opened from the name', () => {
    const { container } = renderTable()
    const name = within(row(container, 'fullHouse')).getByRole('button', { name: 'yahtzee.categories.fullHouse' })
    const rule = document.getElementById(name.getAttribute('aria-describedby')!)
    expect(rule).toHaveTextContent('games.yahtzee.detail.scoring.rows.fullHouse.rule')
    expect(name.getAttribute('popovertarget')).toBe(rule!.id)
    expect(rule!.getAttribute('popover')).toBe('auto')
  })

  it('totals every column, bonus included', () => {
    const upper = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }
    const { container } = renderTable({ players: [{ ...me, scorecard: upper }], canScore: false })
    expect(cells(container, 'sum')[0]).toHaveTextContent('63')
    expect(cells(container, 'bonus')[0]).toHaveTextContent('35')
    expect(screen.getByTestId('yahtzee-total')).toHaveTextContent('98')
  })

  it('settles the bonus at 0 once all six upper boxes are filled short of 63', () => {
    const missed = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 }
    const { container } = renderTable({ players: [{ ...me, scorecard: missed }], canScore: false })
    expect(cells(container, 'bonus')[0]).toHaveTextContent(/^0$/)
    expect(cells(container, 'sum')[0].querySelector('.yz-cell__bar--missed')).not.toBeNull()
  })

  it('greys the column of a player who left', () => {
    renderTable({ departedIds: new Set(['bot']) })
    const header = screen.getAllByRole('columnheader')[2]
    expect(header.classList.contains('is-departed')).toBe(true)
    expect(header).toHaveTextContent('game.ui.playerLeft')
  })
})
