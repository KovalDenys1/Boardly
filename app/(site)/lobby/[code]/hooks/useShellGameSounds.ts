'use client'

import { useEffect, useRef } from 'react'
import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'
import { TURN_AFTER_MOVE_MS, turnCameToViewer } from '@/hooks/useTurnSounds'
import { resultCue } from '@/lib/game-outcome'
import { rendersInLobbyShell } from '@/lib/lobby-page-routing'
import type { PlayOptions } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

export interface UseShellGameSoundsOptions {
  gameType: string | null | undefined
  gameId: string | null | undefined
  currentPlayerId: string | null | undefined
  viewerId: string | null | undefined
  isSpectator: boolean
  /** Server-confirmed (Games.status), so a refused last score cannot spend the game id; undefined until loaded. */
  yahtzeeFinished?: boolean
  yahtzeeOutcome?: GameOutcome
  play: (cue: CueId, options?: PlayOptions) => void
}

/** Memory and Spy play their result from GameResultOverlay; a dedicated page plays all of its own. */
export function useShellGameSounds({
  gameType,
  gameId,
  currentPlayerId,
  viewerId,
  isSpectator,
  yahtzeeFinished,
  yahtzeeOutcome,
  play,
}: UseShellGameSoundsOptions): void {
  const inShell = rendersInLobbyShell(gameType)

  const previousPlayerRef = useRef(currentPlayerId)
  useEffect(() => {
    const previous = previousPlayerRef.current
    previousPlayerRef.current = currentPlayerId
    if (inShell && turnCameToViewer(previous, currentPlayerId, viewerId)) play('turn.mine', { delayMs: TURN_AFTER_MOVE_MS })
  }, [currentPlayerId, viewerId, inShell, play])

  // undefined: nothing loaded yet; null: a game running; a game id: that game finished.
  const finishKey = gameType === 'yahtzee' && gameId && yahtzeeFinished !== undefined ? (yahtzeeFinished ? gameId : null) : undefined
  const loadedFinishRef = useRef<string | null | undefined>(undefined)
  const heardFinishRef = useRef<string | null>(null)
  useEffect(() => {
    if (finishKey === undefined) return
    if (loadedFinishRef.current === undefined) {
      // A page opened on a finished game shows the result without announcing it.
      loadedFinishRef.current = finishKey
      return
    }
    if (!finishKey || finishKey === loadedFinishRef.current || finishKey === heardFinishRef.current) return
    heardFinishRef.current = finishKey
    play(resultCue(yahtzeeOutcome, isSpectator), { gameId: finishKey })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the result is read once, when the finish appears
  }, [finishKey])
}
