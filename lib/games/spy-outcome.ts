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

/**
 * Who won the GAME, which is a different question from who won the round.
 *
 * A round is decided by the vote (or the spy's guess); the game is three rounds
 * of cumulative scoring, and SpyGame.checkWinCondition() ranks `data.scores` to
 * pick the top total, writing it to `state.winner` (lib/games/spy-game.ts). A
 * tied top score leaves `state.winner` unset, which is the engine's draw.
 *
 * #905 shipped a GameResultOverlay that titled itself from resolveSpyOutcome
 * instead - the last round's verdict - so a table where the spy escaped round 3
 * read "Spy Wins!" over a score table whose top row was somebody else, and the
 * trophy icon went to a player who had not won. The review caught it; this is
 * the one place that answers it, so the overlay, the status banner and the
 * results panel cannot drift apart again.
 */
export interface SpyGameResult {
  winnerId: string
  /** Finished with no single top score. */
  isDraw: boolean
  /** The viewer is the winner. False for everyone on a draw. */
  isMine: boolean
}

export function resolveSpyGameResult(input: {
  /** `state.winner` as the engine left it. */
  winnerId?: string | null
  currentUserId?: string | null
}): SpyGameResult {
  const winnerId = input.winnerId || ''
  return {
    winnerId,
    isDraw: winnerId.length === 0,
    isMine: winnerId.length > 0 && !!input.currentUserId && winnerId === input.currentUserId,
  }
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
