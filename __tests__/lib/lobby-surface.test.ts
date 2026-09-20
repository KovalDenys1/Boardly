import { resolveLobbySurface } from '@/lib/lobby-surface'

/**
 * #905 review, MAJOR: holding a finished Guess the Spy board up for everyone
 * closed a private lobby to new players for good. The finished row keeps being
 * returned as the lobby's active game (`?includeFinished=true`, and
 * lib/lobby-snapshot.ts ranks 'finished' above nothing), nothing downgrades it,
 * and the join prompt renders only when no game surface does - so a visitor got
 * a spectator banner over somebody else's results instead of a way in.
 */
describe('resolveLobbySurface', () => {
  const spy = { gameType: 'guess_the_spy' as const }

  it('keeps a finished Spy board up for the players who were at the table', () => {
    expect(resolveLobbySurface({ ...spy, gameStatus: 'finished', isParticipant: true })).toEqual({
      showGameSurface: true,
      showJoinPrompt: false,
      isSpectator: false,
    })
  })

  it('offers a newcomer the join prompt once that game has finished', () => {
    expect(resolveLobbySurface({ ...spy, gameStatus: 'finished', isParticipant: false })).toEqual({
      showGameSurface: false,
      showJoinPrompt: true,
      isSpectator: false,
    })
  })

  it('still shows a live game to a spectator, without offering them the prompt', () => {
    expect(resolveLobbySurface({ ...spy, gameStatus: 'playing', isParticipant: false })).toEqual({
      showGameSurface: true,
      // No prompt over a running game: the surface is already up.
      showJoinPrompt: false,
      isSpectator: true,
    })
  })

  it('drops every other game type to the waiting room when its game finishes', () => {
    for (const gameType of ['memory', 'yahtzee', 'tic_tac_toe', 'alias']) {
      expect(
        resolveLobbySurface({ gameType, gameStatus: 'finished', isParticipant: true }).showGameSurface
      ).toBe(false)
    }
  })

  it('shows the waiting room while the row is still waiting', () => {
    expect(resolveLobbySurface({ ...spy, gameStatus: 'waiting', isParticipant: true })).toEqual({
      showGameSurface: false,
      showJoinPrompt: false,
      isSpectator: false,
    })
  })

  it('offers the prompt to a newcomer in a lobby that has no game row at all', () => {
    expect(
      resolveLobbySurface({ gameType: 'guess_the_spy', gameStatus: undefined, isParticipant: false })
        .showJoinPrompt
    ).toBe(true)
  })
})
