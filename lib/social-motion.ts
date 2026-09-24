/**
 * Motion helpers for the conversation games (#1115): Guess the Spy, Alias,
 * Liar's Party, Sketch & Guess. The motion itself is CSS (the `.social-*`
 * classes in app/globals.css); this is what the pages have to derive to know
 * *what* is new, in the three-state shape `useFreshKey` takes:
 * `undefined` = nothing loaded yet, `null` = loaded and empty, a string = the
 * newest thing.
 */
import type React from 'react'

/**
 * Key of the newest entry of a feed (Q&A history, guess list, chat-like list).
 * `newestFirst` says which end of the array is the newest one.
 */
export function latestEntryKey<T>(
  items: readonly T[] | null | undefined,
  keyOf: (item: T, index: number) => string,
  newestFirst = false,
): string | null | undefined {
  if (items === undefined) return undefined
  if (!items || items.length === 0) return null
  const index = newestFirst ? 0 : items.length - 1
  return keyOf(items[index], index)
}

/** Default step between staggered rows, and how many steps before it stops growing. */
export const STAGGER_STEP_MS = 70
export const STAGGER_MAX_STEPS = 8

/**
 * Animation delay for the `index`-th row of a staggered reveal. Capped, so a
 * ten-player table does not keep the last row waiting for a second.
 */
export function staggerDelayMs(index: number, stepMs = STAGGER_STEP_MS, maxSteps = STAGGER_MAX_STEPS): number {
  if (!Number.isFinite(index) || index <= 0) return 0
  return Math.min(Math.floor(index), maxSteps) * stepMs
}

export function staggerStyle(index: number, stepMs?: number, maxSteps?: number): React.CSSProperties {
  return { animationDelay: `${staggerDelayMs(index, stepMs, maxSteps)}ms` }
}

/**
 * `onAnimationEnd` that fires only for the element's own animation.
 * `animationend` bubbles, so a ScorePop inside a staggered row would otherwise
 * settle the whole reveal the moment its own pop finished.
 */
export function onOwnAnimationEnd(callback: () => void) {
  return (event: React.AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) callback()
  }
}

/**
 * Direction the Alias word leaves in: a guessed word goes up, a skipped one
 * sideways. Derived from the score change between two turn snapshots, since
 * the word itself carries no outcome. `null` means nothing to animate (first
 * word of a turn, a snapshot that did not advance the word).
 */
export type WordExit = 'correct' | 'skip'

export function aliasWordExit(
  previous: { word: string | null; correct: number; skipped: number } | null,
  next: { word: string | null; correct: number; skipped: number },
): WordExit | null {
  if (!previous || !previous.word || !next.word || previous.word === next.word) return null
  if (next.correct > previous.correct) return 'correct'
  if (next.skipped > previous.skipped) return 'skip'
  return null
}
