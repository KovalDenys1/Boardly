'use client'

import { useEffect, useRef } from 'react'
import { playCue } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

/**
 * Turn and move cues for the dedicated game pages.
 *
 * - Someone else's move: `moveCue` at the remote level, when `lastMoveSignature`
 *   changes while `opponentMoved` is true.
 * - The turn coming to the viewer (`isMyTurn` false -> true): `turn.mine`,
 *   `turnDelayMs` after the state change. When one move does both (the usual
 *   two-player case) the viewer hears the move, then their turn.
 *
 * Nothing plays on the first render, nor on the first render with a game
 * (signature going from null to a value is a snapshot loading in, not a move),
 * nor while `enabled` is false (finished game, spectator, waiting room). Mute,
 * volume, a hidden tab and the missing first gesture are the engine's to check.
 */
export interface UseTurnSoundsOptions {
  /** Whether the viewer is the one who has to act now. */
  isMyTurn: boolean
  /**
   * Anything that changes exactly when a move lands: a move count, the last
   * move's timestamp, a round:count pair. `null`/`undefined` means no game yet.
   */
  lastMoveSignature?: string | number | null
  /** Whether the move that produced the current signature came from someone else. */
  opponentMoved?: boolean
  /** False to stay silent (finished game, spectator, waiting room). Defaults to true. */
  enabled?: boolean
  /** Cue for someone else's move, played at the remote level. `null` (the default): the page plays the move itself. */
  moveCue?: CueId | null
  /** A function is read when the turn arrives, after the page's motion has planned the move that brought it. */
  turnDelayMs?: number | (() => number)
}

/** The gap between the opponent's move cue and the viewer's turn cue. */
export const TURN_AFTER_MOVE_MS = 150

/** The lobby shell's turn cue: when the turn comes to the viewer, never when it leaves them. */
export function turnCameToViewer(
  previousPlayerId: string | null | undefined,
  currentPlayerId: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  return Boolean(previousPlayerId && currentPlayerId && viewerId && currentPlayerId !== previousPlayerId && currentPlayerId === viewerId)
}

export function useTurnSounds({
  isMyTurn,
  lastMoveSignature,
  opponentMoved = false,
  enabled = true,
  moveCue = null,
  turnDelayMs = TURN_AFTER_MOVE_MS,
}: UseTurnSoundsOptions): void {
  const prevRef = useRef<{ isMyTurn: boolean; signature: string | number | null } | null>(null)
  const turnDelayRef = useRef(turnDelayMs)
  turnDelayRef.current = turnDelayMs

  useEffect(() => {
    const signature = lastMoveSignature ?? null
    const prev = prevRef.current
    prevRef.current = { isMyTurn, signature }
    // First observation, or the first one with a game: remember, never play.
    if (!prev || prev.signature === null || signature === null || !enabled) return

    if (moveCue && opponentMoved && signature !== prev.signature) playCue(moveCue, { remote: true })
    if (isMyTurn && !prev.isMyTurn) {
      const delay = turnDelayRef.current
      playCue('turn.mine', { delayMs: typeof delay === 'function' ? delay() : delay })
    }
  }, [isMyTurn, lastMoveSignature, opponentMoved, enabled, moveCue])
}
