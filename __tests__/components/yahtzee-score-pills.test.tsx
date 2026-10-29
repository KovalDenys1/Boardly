import { fireEvent, render, screen } from '@testing-library/react'
import YahtzeeScorePills from '@/components/yahtzee/YahtzeeScorePills'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
  }),
}))


const players = [
  { id: 'me', name: 'Ada', score: 10 },
  { id: 'bot', name: 'Dice Strategist', score: 20, isBot: true, profileId: null },
  { id: 'anna', name: 'Anna', score: 30, profileId: 'anna' },
]

describe('YahtzeeScorePills', () => {
  it('opens another player’s card from their pill, and only theirs', () => {
    const onOpenProfile = jest.fn()
    render(<YahtzeeScorePills players={players} viewerId="me" currentTurnId="anna" onOpenProfile={onOpenProfile} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName(/report\.openPlayerCard/)
    expect(buttons[0]).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(buttons[0])
    expect(onOpenProfile).toHaveBeenCalledWith('anna')
  })

  it('stays display-only without a handler', () => {
    render(<YahtzeeScorePills players={players} viewerId="me" currentTurnId="me" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
