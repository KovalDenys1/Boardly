/**
 * Which of the lobby page's three surfaces a viewer gets: the join prompt, the
 * waiting room, or the game board.
 *
 * It lives here rather than inline in LobbyPageClient because #905 got it wrong
 * in a way that inline booleans hide. Guess the Spy finishes its game row on the
 * last round (#729), and the page unmounted the board the moment the row stopped
 * saying 'playing' - so the table never saw the reveal, the final scores or the
 * after-game block. #905 held the board up for a finished Spy row, and held it
 * up for everybody.
 *
 * That second part is the bug the review caught. A finished row keeps coming
 * back as the lobby's active game: every read is `?includeFinished=true`
 * (app/lobby/[code]/hooks/useLobbyActions.ts) and lib/lobby-snapshot.ts ranks
 * 'finished' above nothing, while nothing downgrades it - the auto-transition in
 * lib/lobby-series-transition.ts only fires for tic_tac_toe. So a visitor who
 * opened a private lobby after its game had ended got a spectator banner over
 * somebody else's results, permanently, instead of the prompt to join. Holding
 * the surface up is for the people who were at that table; for everyone else the
 * lobby is simply a lobby with no game running.
 */
export interface LobbySurface {
  /** The game board is on screen (live, or a finished Spy game being read). */
  showGameSurface: boolean
  /** The join prompt is offered - public lobbies auto-join through the same condition. */
  showJoinPrompt: boolean
  /** Watching a surface the viewer is not playing on. */
  isSpectator: boolean
}

/** The only game whose finished board outlives its row, and why: see above. */
const KEEPS_FINISHED_SURFACE = 'guess_the_spy'

export function resolveLobbySurface(input: {
  /** The lobby's relevant game row status: 'waiting' | 'playing' | 'finished'. */
  gameStatus?: string | null
  gameType?: string | null
  /** The viewer holds a seat in that game. */
  isParticipant: boolean
}): LobbySurface {
  const isGameStarted = input.gameStatus === 'playing'
  const keepFinishedGameSurface =
    input.gameStatus === 'finished' &&
    input.gameType === KEEPS_FINISHED_SURFACE &&
    input.isParticipant

  const showGameSurface = isGameStarted || keepFinishedGameSurface

  return {
    showGameSurface,
    showJoinPrompt: !input.isParticipant && !showGameSurface,
    isSpectator: showGameSurface && !input.isParticipant,
  }
}
