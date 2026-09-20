import { resolveSpyOutcome } from '@/lib/games/spy-outcome'

/**
 * #905 put a GameResultOverlay over the Spy results panel, so the winner is
 * named in two places. These are the four branches that decide it; they live
 * in one exported function precisely so the overlay and the panel cannot
 * disagree.
 *
 * Ids are shaped like the real thing – Players.userId is a guest id or a cuid,
 * never a bare 'a'/'b'.
 */
const SPY = 'guest-38f84943-8c99-4de1-ace8-00973711c848'
const INNOCENT = 'cmuabbsne000072si1gg8rjbq'

describe('resolveSpyOutcome', () => {
  it('gives the round to the spy when the vote lands on someone innocent', () => {
    expect(resolveSpyOutcome({ location: 'Zoo', eliminatedId: INNOCENT, spyId: SPY })).toEqual({
      spyWon: true,
      wasGuessRound: false,
      guessWasCorrect: false,
      noElimination: false,
    })
  })

  it('gives the round to the regulars when the spy is voted out', () => {
    const out = resolveSpyOutcome({ location: 'Zoo', eliminatedId: SPY, spyId: SPY })
    expect(out.spyWon).toBe(false)
    expect(out.noElimination).toBe(false)
  })

  it('treats a tie – nobody eliminated – as a win for the spy', () => {
    const out = resolveSpyOutcome({ location: 'Zoo', eliminatedId: '', spyId: SPY })
    expect(out.spyWon).toBe(true)
    expect(out.noElimination).toBe(true)
  })

  it('decides a guess round on the guess alone, ignoring the vote', () => {
    // The spy guessed right, and the vote had also caught them. The guess wins.
    const right = resolveSpyOutcome({
      spyGuessedLocation: 'Zoo',
      location: 'Zoo',
      eliminatedId: SPY,
      spyId: SPY,
    })
    expect(right).toEqual({ spyWon: true, wasGuessRound: true, guessWasCorrect: true, noElimination: false })

    // The spy guessed wrong, and nobody was voted out. The guess still loses.
    const wrong = resolveSpyOutcome({
      spyGuessedLocation: 'Casino',
      location: 'Zoo',
      eliminatedId: '',
      spyId: SPY,
    })
    expect(wrong.spyWon).toBe(false)
    expect(wrong.wasGuessRound).toBe(true)
    expect(wrong.noElimination).toBe(false)
  })
})
