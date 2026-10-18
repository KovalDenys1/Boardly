'use client'

import { useLiveCues } from '@/hooks/useLiveCues'
import { prefersReducedMotion } from '@/lib/motion'

export interface UseSpectatorResultCueOptions {
  /** Watching without a seat, where the page shows no GameResultOverlay and so plays no result. */
  isSpectator: boolean
  isFinished: boolean
  gameId: string | null | undefined
  /** Which finish of this game id, read from state (a series' round count, the finishing move's time); a game that ends once can leave it out. */
  finishKey?: string | number | null
  /** The players' overlay reveal delay, so the spectator hears the end when the table does. */
  revealDelayMs?: number
}

/** `result.over` for a spectator on each finish they watch happen; the state a page loads into is never news. */
export function useSpectatorResultCue({ isSpectator, isFinished, gameId, finishKey = null, revealDelayMs = 0 }: UseSpectatorResultCueOptions): void {
  useLiveCues(
    isSpectator && gameId ? { isFinished, finishKey } : null,
    (prev, next) =>
      !prev.isFinished && next.isFinished
        ? [{ cue: 'result.over', options: { gameId: `${gameId}#${next.finishKey ?? 'end'}`, delayMs: prefersReducedMotion() ? 0 : revealDelayMs } }]
        : [],
    { scope: gameId },
  )
}
