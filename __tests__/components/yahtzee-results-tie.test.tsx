import { render, screen, within } from '@testing-library/react'
import YahtzeeResults from '@/components/YahtzeeResults'
import { analyzeResults } from '@/lib/yahtzee-results'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

function renderResults(totals: Record<string, number>, currentUserId: string) {
  const results = analyzeResults(
    Object.entries(totals).map(([id, score]) => ({ id, name: id, score })),
    (id) => ({ chance: totals[id] }),
  )
  return render(
    <YahtzeeResults
      results={results}
      currentUserId={currentUserId}
      canStartGame={false}
      onPlayAgain={() => {}}
      onBackToLobby={() => {}}
    />,
  )
}

describe('YahtzeeResults on a tie (#1493)', () => {
  it('shows a shared first place and names both leaders, with no winner', () => {
    renderResults({ Alpha: 120, Bravo: 120 }, 'Alpha')

    const leader = screen.getByTestId('yahtzee-results-leader')
    expect(within(leader).getByText('Shared first place')).toBeTruthy()
    expect(within(leader).getByText("It's a Tie!")).toBeTruthy()
    expect(within(leader).getByText('Alpha, Bravo')).toBeTruthy()
    expect(screen.getAllByText('TIE')).toHaveLength(2)
    expect(screen.getByText('Tied at 120')).toBeTruthy()
    expect(screen.queryByText('You Won!')).toBeNull()
    expect(screen.queryByText('WINNER')).toBeNull()
    expect(screen.queryByText(/^Margin/)).toBeNull()
  })

  it('marks only the two leaders of three as tied', () => {
    renderResults({ Alpha: 120, Charlie: 90, Bravo: 120 }, 'Charlie')

    expect(within(screen.getByTestId('yahtzee-results-leader')).getByText('Alpha, Bravo')).toBeTruthy()
    expect(screen.getAllByText('TIE')).toHaveLength(2)
  })

  it('is unchanged for an outright win', () => {
    renderResults({ Alpha: 120, Bravo: 90 }, 'Alpha')

    expect(within(screen.getByTestId('yahtzee-results-leader')).getByText('You Won!')).toBeTruthy()
    expect(screen.getAllByText('WINNER')).toHaveLength(1)
    expect(screen.getByText('Margin +30')).toBeTruthy()
    expect(screen.queryByText('TIE')).toBeNull()
  })
})
