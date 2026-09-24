'use client'

import { useEffect, useRef } from 'react'
import { sounds } from '@/lib/sounds'

/**
 * Turn and move cues for the dedicated game pages (#1111).
 *
 * Until this hook the eight dedicated pages played only `win`: the opponent's
 * or the bot's move landed in silence and nothing said "your move". The lobby
 * page (Yahtzee, Memory, Spy) has played `turnChange` for a long time; this is
 * the same cue, shared, so each page only has to say what its state means.
 *
 * - `turnChange` when the turn comes to the viewer (`isMyTurn` false -> true).
 * - A light move cue when someone else's move arrives: `lastMoveSignature`
 *   changes while `opponentMoved` is true. When both happen in the same render
 *   (the usual two-player case: the opponent moves and hands the turn over)
 *   only `turnChange` plays, so the two sounds never stack.
 *
 * Nothing plays on the first render, nor on the first render with a game
 * (signature going from null to a value is a snapshot loading in, not a move),
 * while
 * `enabled` is false (finished game — the page's own `win` stays the only end
 * cue — or a spectator), or before the user has interacted with the document
 * (browsers refuse autoplay anyway). The sound-enabled setting is honoured by
 * `sounds.play` itself.
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
  /** Sound for someone else's move; must be a key `lib/sounds` already loads. */
  moveSound?: string
}

/** Someone else's move is quieter than the viewer's own cues: a nudge, not an alert. */
export const OPPONENT_MOVE_VOLUME_FACTOR = 0.6

export function useTurnSounds({
  isMyTurn,
  lastMoveSignature,
  opponentMoved = false,
  enabled = true,
  moveSound = 'click',
}: UseTurnSoundsOptions): void {
  const prevRef = useRef<{ isMyTurn: boolean; signature: string | number | null } | null>(null)

  useEffect(() => {
    const signature = lastMoveSignature ?? null
    const prev = prevRef.current
    prevRef.current = { isMyTurn, signature }
    // First observation, or the first one with a game: remember, never play.
    if (!prev || prev.signature === null || signature === null || !enabled) return
    if (!sounds.hasUserInteracted()) return

    const turnArrived = isMyTurn && !prev.isMyTurn
    const moveArrived = opponentMoved && signature !== prev.signature

    if (turnArrived) {
      sounds.play('turnChange')
    } else if (moveArrived) {
      sounds.play(moveSound, { volume: sounds.getVolume() * OPPONENT_MOVE_VOLUME_FACTOR })
    }
  }, [isMyTurn, lastMoveSignature, opponentMoved, enabled, moveSound])
}
