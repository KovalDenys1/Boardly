import { fireEvent, render, screen } from '@testing-library/react'
import BlockedText from '@/components/BlockedText'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

describe('BlockedText', () => {
  it('shows the text of a player the viewer has not blocked', () => {
    render(<BlockedText blocked={false}>I can juggle</BlockedText>)

    expect(screen.getByText('I can juggle')).toBeInTheDocument()
    expect(screen.queryByText('blockedPlayers.hiddenText')).not.toBeInTheDocument()
  })

  it('collapses a blocked player\'s text to one line until Show is pressed', () => {
    render(<BlockedText blocked>I can juggle</BlockedText>)

    expect(screen.queryByText('I can juggle')).not.toBeInTheDocument()
    expect(screen.getByText('blockedPlayers.hiddenText')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'blockedPlayers.show' }))

    expect(screen.getByText('I can juggle')).toBeInTheDocument()
    expect(screen.queryByText('blockedPlayers.hiddenText')).not.toBeInTheDocument()
  })
})
