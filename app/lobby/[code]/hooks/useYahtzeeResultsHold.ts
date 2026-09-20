import { useCallback, useEffect, useState } from 'react'

/**
 * How long a finished Yahtzee game keeps its results screen before the page goes
 * back to the lobby room by itself.
 */
export const YAHTZEE_RESULTS_HOLD_MS = 12_000

interface YahtzeeResultsHoldState {
  gameId: string
  releaseAt: number
}

export interface YahtzeeResultsHold {
  /** Whether the page should render the held, full-screen results block. */
  showResults: boolean
  /** When the countdown chip in `YahtzeeResults` expires, or null once released. */
  autoReturnAt: number | null
  /** Let go of this game's results now - the player asked to go back. */
  release: () => void
}

/**
 * The results screen of a finished Yahtzee game, held for a few seconds and then
 * released (#1052).
 *
 * `LobbyPageClient` has two places that can render `YahtzeeResults`: a held
 * full-screen block, and the in-game shell's own finished branch. Whichever is
 * chosen, the after-game block inside reports `push_prompt_shown` and
 * `signup_prompt shown` on mount - so the page switching from one to the other
 * mid-finish is two mounts and two pairs of beacons for one finished game, the
 * same overcount the ticket reports for Memory.
 *
 * That is what an effect-set hold caused. The hold was state written by an effect,
 * so on the render where the game first reads as finished it was still null, the
 * page took the in-game branch, and the effect then moved it. So the condition is
 * inverted here: "this game has not been released yet" is true from the first
 * render, before any effect has run, and the held branch is picked once and kept.
 * `releaseAt` is computed in the same render for the same reason - read from an
 * effect it was null for one commit and the countdown chip was missing.
 */
export function useYahtzeeResultsHold(
  gameId: string | null | undefined,
  isFinished: boolean,
): YahtzeeResultsHold {
  const [hold, setHold] = useState<YahtzeeResultsHoldState | null>(null)
  const [releasedGameId, setReleasedGameId] = useState<string | null>(null)

  const showResults = Boolean(isFinished && gameId && releasedGameId !== gameId)

  // A render-phase update, which React applies before it commits this render -
  // the documented way to derive state from props without a frame in between.
  // An effect here is what put YahtzeeResults in two places for one game.
  if (showResults && gameId && hold?.gameId !== gameId) {
    setHold({ gameId, releaseAt: Date.now() + YAHTZEE_RESULTS_HOLD_MS })
  }

  useEffect(() => {
    if (!hold || typeof window === 'undefined') {
      return
    }

    const heldGameId = hold.gameId
    const timer = window.setTimeout(() => {
      setReleasedGameId(heldGameId)
      setHold((prev) => (prev?.gameId === heldGameId ? null : prev))
    }, Math.max(0, hold.releaseAt - Date.now()))

    return () => window.clearTimeout(timer)
  }, [hold])

  const release = useCallback(() => {
    if (gameId) setReleasedGameId(gameId)
    setHold(null)
  }, [gameId])

  return {
    showResults,
    autoReturnAt: hold && hold.gameId === gameId ? hold.releaseAt : null,
    release,
  }
}
