import { renderHook } from '@testing-library/react'
import { useShellGameSounds, type UseShellGameSoundsOptions } from '@/app/lobby/[code]/hooks/useShellGameSounds'

const play = jest.fn()

function setup(initial: Omit<UseShellGameSoundsOptions, 'play'>) {
  return renderHook((props: Omit<UseShellGameSoundsOptions, 'play'>) => useShellGameSounds({ ...props, play }), { initialProps: initial })
}

const base = { gameId: 'g1', viewerId: 'me', isSpectator: false }

describe('useShellGameSounds (#1464)', () => {
  beforeEach(() => play.mockClear())

  it.each(['yahtzee', 'memory', 'guess_the_spy'])('plays turn.mine 150 ms after the turn comes to the viewer in %s', (gameType) => {
    const { rerender } = setup({ ...base, gameType, currentPlayerId: 'bot' })
    rerender({ ...base, gameType, currentPlayerId: 'me' })
    expect(play.mock.calls).toEqual([['turn.mine', { delayMs: 150 }]])
  })

  it('plays no turn when the turn leaves the viewer, on the first render, or for a spectator', () => {
    const first = setup({ ...base, gameType: 'yahtzee', currentPlayerId: 'me' })
    first.rerender({ ...base, gameType: 'yahtzee', currentPlayerId: 'bot' })
    const watcher = setup({ ...base, gameType: 'yahtzee', viewerId: null, isSpectator: true, currentPlayerId: 'a' })
    watcher.rerender({ ...base, gameType: 'yahtzee', viewerId: null, isSpectator: true, currentPlayerId: 'b' })
    expect(play).not.toHaveBeenCalled()
  })

  it.each(['tic_tac_toe', 'connect_four', 'checkers', 'ludo', 'rock_paper_scissors', 'alias', 'liars_party', 'sketch_and_guess'])(
    'plays no turn or result cue while %s, a dedicated game, is active',
    (gameType) => {
      const { rerender } = setup({ ...base, gameType, currentPlayerId: 'bot', yahtzeeFinished: false })
      rerender({ ...base, gameType, currentPlayerId: 'me', yahtzeeFinished: false })
      rerender({ ...base, gameType, currentPlayerId: 'me', yahtzeeFinished: true, yahtzeeOutcome: 'win' })
      expect(play).not.toHaveBeenCalled()
    },
  )

  it('plays the Yahtzee result once when the game on screen finishes, keyed on its id', () => {
    const { rerender } = setup({ ...base, gameType: 'yahtzee', currentPlayerId: 'bot', yahtzeeFinished: false })
    rerender({ ...base, gameType: 'yahtzee', currentPlayerId: 'bot', yahtzeeFinished: true, yahtzeeOutcome: 'loss' })
    rerender({ ...base, gameType: 'yahtzee', currentPlayerId: 'bot', yahtzeeFinished: true, yahtzeeOutcome: 'loss' })
    expect(play.mock.calls).toEqual([['result.loss', { gameId: 'g1' }]])
  })

  it('stays silent for a game already finished when the page opened, and plays the rematch’s finish', () => {
    const { rerender } = setup({ ...base, gameType: 'yahtzee', currentPlayerId: undefined, yahtzeeFinished: undefined })
    rerender({ ...base, gameType: 'yahtzee', currentPlayerId: 'me', yahtzeeFinished: true, yahtzeeOutcome: 'win' })
    expect(play).not.toHaveBeenCalled()

    rerender({ ...base, gameId: 'g2', gameType: 'yahtzee', currentPlayerId: 'me', yahtzeeFinished: false })
    rerender({ ...base, gameId: 'g2', gameType: 'yahtzee', currentPlayerId: 'me', yahtzeeFinished: true, yahtzeeOutcome: 'draw' })
    expect(play.mock.calls).toEqual([['result.draw', { gameId: 'g2' }]])
  })

  it('tells a spectator only that the game is over', () => {
    const { rerender } = setup({ ...base, gameType: 'yahtzee', isSpectator: true, currentPlayerId: 'a', yahtzeeFinished: false })
    rerender({ ...base, gameType: 'yahtzee', isSpectator: true, currentPlayerId: 'a', yahtzeeFinished: true })
    expect(play.mock.calls).toEqual([['result.over', { gameId: 'g1' }]])
  })

  it('leaves the Memory and Spy result to their GameResultOverlay', () => {
    const { rerender } = setup({ ...base, gameType: 'memory', currentPlayerId: 'me', yahtzeeFinished: false })
    rerender({ ...base, gameType: 'memory', currentPlayerId: 'me', yahtzeeFinished: true, yahtzeeOutcome: 'win' })
    expect(play).not.toHaveBeenCalled()
  })
})
