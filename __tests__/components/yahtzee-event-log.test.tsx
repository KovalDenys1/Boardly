import { render } from '@testing-library/react'
import YahtzeeEventLog, { eventSlots } from '@/components/yahtzee/YahtzeeEventLog'
import type { RollHistoryEntry } from '@/components/RollHistory'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))

function roll(n: number): RollHistoryEntry {
  return { id: `r${n}`, turnNumber: 1, playerName: `P${n}`, rollNumber: 1, dice: [1, 2, 3, 4, 5], held: [], timestamp: n, type: 'roll' }
}

describe('eventSlots (#1363)', () => {
  it('pads a short history with empty slots, newest first', () => {
    expect(eventSlots([roll(1), roll(2), roll(3)], 5).map((e) => e?.id ?? null)).toEqual(['r3', 'r2', 'r1', null, null])
  })

  it('keeps only the newest entries when the history is longer than the slots', () => {
    const entries = Array.from({ length: 12 }, (_, i) => roll(i + 1))
    expect(eventSlots(entries, 4).map((e) => e?.id)).toEqual(['r12', 'r11', 'r10', 'r9'])
  })
})

describe('YahtzeeEventLog (#1363)', () => {
  it.each([0, 3, 12])('always draws the same number of rows (%i events)', (count) => {
    const entries = Array.from({ length: count }, (_, i) => roll(i + 1))
    const { container } = render(<YahtzeeEventLog entries={entries} rows={6} />)
    expect(container.querySelectorAll('.yz-event')).toHaveLength(6)
  })

  it('never scrolls inside the card', () => {
    const entries = Array.from({ length: 12 }, (_, i) => roll(i + 1))
    const { container } = render(<YahtzeeEventLog entries={entries} rows={6} />)
    expect(container.querySelector('[class*="overflow-y-auto"], [class*="overflow-auto"], .ttt-history-list')).toBeNull()
  })

  it('fills its column when nothing else shares it', () => {
    const { container, rerender } = render(<YahtzeeEventLog entries={[]} rows={6} fill />)
    expect(container.firstElementChild?.classList.contains('ttt-history-card--fill')).toBe(true)
    rerender(<YahtzeeEventLog entries={[]} rows={6} />)
    expect(container.firstElementChild?.classList.contains('ttt-history-card--fill')).toBe(false)
  })
})
