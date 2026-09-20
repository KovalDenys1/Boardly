/**
 * Who won a Guess the Spy round, from the four facts the engine puts in state.
 *
 * It lives here, and not in the results panel that used to own it, because
 * #905 put a GameResultOverlay over that panel: the overlay names the winner
 * and so does the panel under it, and two copies of this three-branch rule
 * would drift the first time one of them was touched.
 *
 * A round where the spy guessed is decided by the guess alone – the vote never
 * happened. Otherwise the spy wins unless the table voted them out, which
 * includes the tie case where `eliminatedId` is empty and nobody went.
 */
export interface SpyOutcome {
  spyWon: boolean
  wasGuessRound: boolean
  guessWasCorrect: boolean
  noElimination: boolean
}

export function resolveSpyOutcome(input: {
  spyGuessedLocation?: string
  location: string
  eliminatedId: string
  spyId: string
}): SpyOutcome {
  const wasGuessRound = input.spyGuessedLocation !== undefined
  const guessWasCorrect = input.spyGuessedLocation === input.location
  return {
    wasGuessRound,
    guessWasCorrect,
    spyWon: wasGuessRound ? guessWasCorrect : input.eliminatedId !== input.spyId,
    noElimination: !wasGuessRound && input.eliminatedId.length === 0,
  }
}
