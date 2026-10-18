import { render } from '@testing-library/react'
import YahtzeeEventLog from '@/components/yahtzee/YahtzeeEventLog'
import type { RollHistoryEntry } from '@/components/RollHistory'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

function roll(n: number): RollHistoryEntry {
  return { id: `r${n}`, turnNumber: 1, playerName: `P${n}`, rollNumber: 1, dice: [1, 2, 3, 4, 5], held: [], timestamp: n, type: 'roll' }
}

describe('YahtzeeEventLog', () => {
  it('lists only the entries that exist, newest first', () => {
    const { container } = render(<YahtzeeEventLog entries={[roll(1), roll(2), roll(3)]} />)
    const rows = container.querySelectorAll('.yz-event')
    expect(rows).toHaveLength(3)
    expect(rows[0].textContent).toContain('P3')
    expect(rows[2].textContent).toContain('P1')
  })

  it('says there are no rolls yet instead of drawing empty rows', () => {
    const { container, getByText } = render(<YahtzeeEventLog entries={[]} />)
    expect(container.querySelectorAll('.yz-event')).toHaveLength(0)
    expect(getByText('yahtzee.history.empty')).toBeInTheDocument()
  })

  it('slides in an entry that arrives after mount, not the ones it opened with', () => {
    const { container, rerender } = render(<YahtzeeEventLog entries={[roll(1), roll(2)]} />)
    expect(container.querySelectorAll('.ttt-history-row-in')).toHaveLength(0)
    rerender(<YahtzeeEventLog entries={[roll(1), roll(2), roll(3)]} />)
    const fresh = container.querySelectorAll('.ttt-history-row-in')
    expect(fresh).toHaveLength(1)
    expect(fresh[0].textContent).toContain('P3')
  })
})
