import { useCallback, useState } from 'react'

export interface YahtzeeResultsHold {
  /** Whether the page should render the held, full-screen results block. */
  showResults: boolean
  /** Let go of this game's results now - the player asked to go back. */
  release: () => void
}

/**
 * The results screen of a finished Yahtzee game, held until the player leaves it
 * (#1052).
 *
 * `LobbyPageClient` has two places that can render `YahtzeeResults`: a held
 * full-screen block, and the in-game shell's own finished branch. Whichever is
 * chosen, the after-game block inside reports `push_prompt_shown` and
 * `signup_prompt shown` on mount - so the page switching from one to the other
 * mid-finish is two mounts and two pairs of beacons for one finished game.
 *
 * So the condition is derived in render: "this game has not been released yet" is
 * true from the first render, before any effect has run, and the held branch is
 * picked once and kept.
 */
export function useYahtzeeResultsHold(
  gameId: string | null | undefined,
  isFinished: boolean,
): YahtzeeResultsHold {
  const [releasedGameId, setReleasedGameId] = useState<string | null>(null)

  const showResults = Boolean(isFinished && gameId && releasedGameId !== gameId)

  const release = useCallback(() => {
    if (gameId) setReleasedGameId(gameId)
  }, [gameId])

  return { showResults, release }
}
