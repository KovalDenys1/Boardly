/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import WaitingRoomActions from '@/app/(site)/lobby/[code]/components/WaitingRoomActions'

jest.mock('@/lib/sound-engine', () => ({ playCue: jest.fn() }))
jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const lobby = { gameType: 'sketch_and_guess', maxPlayers: 10, creatorId: 'host', creator: { username: 'Host' } }
const game = { players: ['host', 'p2', 'p3'].map((id) => ({ id, user: { bot: false } })) }

function renderBar(termsRequired: boolean, onAcceptTerms = jest.fn().mockResolvedValue(true)) {
  render(
    <WaitingRoomActions
      game={game as never}
      lobby={lobby as never}
      minPlayers={3}
      canStartGame
      startingGame={false}
      onStartGame={jest.fn()}
      termsRequired={termsRequired}
      onAcceptTerms={onAcceptTerms}
    />
  )
  return onAcceptTerms
}

describe('WaitingRoomActions – Start after a custom-words refusal (#1482)', () => {
  it('shows the consent panel where the Start button is', () => {
    const onAcceptTerms = renderBar(true)

    expect(screen.queryByRole('button', { name: 'game.ui.startGame' })).toBeNull()
    expect(screen.getByText('chat.termsPromptPlay')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'chat.termsAcceptPlay' }))
    expect(onAcceptTerms).toHaveBeenCalledTimes(1)
  })

  it('shows the Start button when the terms are not in the way', () => {
    renderBar(false)

    expect(screen.getByRole('button', { name: 'game.ui.startGame' })).toBeInTheDocument()
    expect(screen.queryByText('chat.termsPromptPlay')).toBeNull()
  })
})
