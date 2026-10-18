'use client'

import { useEffect, useRef } from 'react'
import { reducedMotionTiming } from '@/lib/board-sounds'
import { playCue, type PlayOptions } from '@/lib/sound-engine'
import type { CueId } from '@/lib/sound-map'

export interface CuePlay {
  cue: CueId
  options?: PlayOptions
}

export interface LiveCuesOptions<T> {
  /** The game the snapshots belong to: a new one drops the last snapshot and empties `scoped`. */
  scope?: string | null
  /** Per-game memory a page keeps beside the snapshots, such as cues already heard at a press. */
  scoped?: readonly { clear(): void }[]
  /** Cues for the first snapshot, for the one case where the state a board mounts into is news. */
  loadCues?: (first: T) => readonly CuePlay[]
}

/** Under reduced motion the cues of one change keep their order, a short gap apart, as reducedMotionTiming spaces the boards'. */
export function motionCues(cues: CuePlay[], reducedMotion: boolean): CuePlay[] {
  if (!reducedMotion || cues.length === 0) return cues
  const spaced = reducedMotionTiming(cues.map(({ cue, options }, i) => ({ id: String(i), cue, atMs: options?.delayMs ?? 0, remote: !!options?.remote })))
  return cues.map(({ cue, options }, i) => ({ cue, options: { ...options, delayMs: spaced[i].atMs } }))
}

/** The first snapshot is the state the page loaded into, never news unless `loadCues` says so; null or a new scope forgets it. */
export function useLiveCues<T>(
  snapshot: T | null | undefined,
  cuesFor: (prev: T, next: T) => readonly CuePlay[],
  { scope, scoped, loadCues }: LiveCuesOptions<T> = {},
): void {
  const key = snapshot == null ? null : JSON.stringify(snapshot)
  const prevRef = useRef<T | null>(null)
  const scopeRef = useRef(scope)
  const handlersRef = useRef({ cuesFor, loadCues, scoped })
  useEffect(() => {
    handlersRef.current = { cuesFor, loadCues, scoped }
  })
  useEffect(() => {
    const { cuesFor: diff, loadCues: onLoad, scoped: memory } = handlersRef.current
    if (scopeRef.current !== scope) {
      scopeRef.current = scope
      prevRef.current = null
      memory?.forEach((set) => set.clear())
    }
    if (key === null) {
      prevRef.current = null
      return
    }
    const next = JSON.parse(key) as T
    const prev = prevRef.current
    prevRef.current = next
    const cues = prev ? diff(prev, next) : onLoad?.(next) ?? []
    for (const { cue, options } of cues) playCue(cue, options)
  }, [key, scope])
}
