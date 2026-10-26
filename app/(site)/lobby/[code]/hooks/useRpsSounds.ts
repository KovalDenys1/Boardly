'use client'

import { useEffect, useRef } from 'react'
import { useLiveCues, type CuePlay } from '@/hooks/useLiveCues'
import { RPS_REVEAL_MS, RPS_SHAKE_MS } from '@/lib/rps-motion'
import { reducedMotionTiming, startCueRun, type CueRun, type ScheduledCue } from '@/lib/board-sounds'
import { prefersReducedMotion } from '@/lib/motion'
import type { CueId } from '@/lib/sound-map'

export interface RpsSnapshot {
  rounds: number
  ready: string[]
  /** The newest round's winner: a player id, 'draw', or null before the first round. */
  lastWinner: string | null
  /** That round won the match, so GameResultOverlay has the verdict. */
  matchOver: boolean
}

export interface RpsCueContext {
  viewerId: string | null | undefined
  /** The viewer holds one of the two seats; a spectator does not. */
  isSeated: boolean
  reducedMotion: boolean
}

function roundResultCue(winner: string | null, { viewerId, isSeated }: RpsCueContext): CueId {
  if (!isSeated || !winner) return 'round.end'
  if (winner === 'draw') return 'round.draw'
  return winner === viewerId ? 'round.won' : 'round.lost'
}

export function rpsRevealSchedule(winner: string | null, matchOver: boolean, ctx: RpsCueContext): ScheduledCue[] {
  const cues: ScheduledCue[] = [
    { id: 'shake', cue: 'rps.shake', atMs: 0, remote: false },
    { id: 'throw', cue: 'rps.throw', atMs: RPS_SHAKE_MS, remote: false },
  ]
  // Under reduced motion the overlay reveals at once, so a round cue would land after the match's result.
  if (!matchOver) cues.push({ id: 'result', cue: roundResultCue(winner, ctx), atMs: RPS_REVEAL_MS, remote: false })
  return ctx.reducedMotion ? reducedMotionTiming(cues) : cues
}

export function rpsCues(prev: RpsSnapshot, next: RpsSnapshot, ctx: RpsCueContext): { cues: CuePlay[]; reveal: ScheduledCue[] | null } {
  if (next.rounds === prev.rounds + 1) return { cues: [], reveal: rpsRevealSchedule(next.lastWinner, next.matchOver, ctx) }
  if (next.rounds !== prev.rounds) return { cues: [], reveal: null }
  const ownId = ctx.isSeated ? ctx.viewerId : null
  const locked = next.ready.some((id) => id !== ownId && !prev.ready.includes(id))
  return { cues: locked ? [{ cue: 'vote.cast', options: { remote: true } }] : [], reveal: null }
}

/** The opponent locking in and the reveal timed to the hands; my own lock plays at the press. */
export function useRpsSounds(
  snapshot: RpsSnapshot | null,
  { gameId, viewerId, isSeated }: Omit<RpsCueContext, 'reducedMotion'> & { gameId: string | null | undefined },
): void {
  const runRef = useRef<CueRun | null>(null)
  useLiveCues(
    snapshot,
    (prev, next) => {
      const { cues, reveal } = rpsCues(prev, next, { viewerId, isSeated, reducedMotion: prefersReducedMotion() })
      if (reveal) {
        runRef.current?.cancel()
        runRef.current = startCueRun(reveal)
      }
      return cues
    },
    { scope: gameId },
  )
  useEffect(() => () => runRef.current?.cancel(), [])
}
