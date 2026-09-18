/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import WaitingRoomGuide from '@/app/lobby/[code]/components/WaitingRoomGuide'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const KICKED = [{ userId: 'kicked-1', username: 'Ann', avatarUrl: null }]

describe('WaitingRoomGuide – what fills the region under the player list (#899)', () => {
  it('gives the lobby its own game’s rule line', () => {
    render(<WaitingRoomGuide gameType="tic_tac_toe" />)
    expect(screen.getByText('game.ui.howToPlayRuleTicTacToe')).toBeTruthy()
    expect(screen.getByText('game.ui.howToPlayReady')).toBeTruthy()
    expect(screen.getByText('game.ui.howToPlayStart')).toBeTruthy()
  })

  it('falls back to the generic line for a game with no rule of its own', () => {
    // Never to GameEngine.getGameRules(): it returns hardcoded English.
    render(<WaitingRoomGuide gameType="telephone_doodle" />)
    expect(screen.getByText('game.ui.howToPlayRuleFallback')).toBeTruthy()
  })

  it('survives a lobby with no game type', () => {
    render(<WaitingRoomGuide gameType={null} />)
    expect(screen.getByText('game.ui.howToPlayRuleFallback')).toBeTruthy()
  })
})

describe('WaitingRoomGuide – the host lets a removed player back in (#1024)', () => {
  it('lists who was removed and hands the undo their user id', () => {
    const onUnkickPlayer = jest.fn()
    render(
      <WaitingRoomGuide gameType="memory" kickedPlayers={KICKED} onUnkickPlayer={onUnkickPlayer} />
    )

    expect(screen.getByText('Ann')).toBeTruthy()
    fireEvent.click(screen.getByText('game.ui.letBackIn'))
    expect(onUnkickPlayer).toHaveBeenCalledWith('kicked-1')
  })

  it('shows nothing to a viewer who cannot undo a kick', () => {
    // The API never sends the list to a non-host, but the panel must not be one
    // stale prop away from showing moderation history to the room either.
    render(<WaitingRoomGuide gameType="memory" kickedPlayers={KICKED} />)
    expect(screen.queryByText('game.ui.removedPlayers')).toBeNull()
    expect(screen.queryByText('Ann')).toBeNull()
  })

  it('says nothing about removals when nobody was removed', () => {
    render(<WaitingRoomGuide gameType="memory" kickedPlayers={[]} onUnkickPlayer={jest.fn()} />)
    expect(screen.queryByText('game.ui.removedPlayers')).toBeNull()
  })

  it('names a deleted guest account rather than showing a blank row', () => {
    render(
      <WaitingRoomGuide
        gameType="memory"
        kickedPlayers={[{ userId: 'ghost-1', username: null, avatarUrl: null }]}
        onUnkickPlayer={jest.fn()}
      />
    )
    expect(screen.getByText('game.ui.player')).toBeTruthy()
  })
})
