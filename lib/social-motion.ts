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
 * The Alias describer's word card (#1115). When the word changes, the old one
 * leaves in the direction of what happened to it – up for a guess, sideways
 * for a skip – while the new one comes in. The outcome is read off the turn's
 * last card result, which the engine appends in the same move that advances
 * the word. `generation` keys the layers so each change mounts fresh nodes.
 */
export type WordExit = 'correct' | 'skip'

export interface WordSwapState {
  word: string
  leaving: { word: string; exit: WordExit } | null
  generation: number
}

export function initialWordSwap(word: string): WordSwapState {
  return { word, leaving: null, generation: 0 }
}

export function advanceWordSwap(
  state: WordSwapState,
  word: string,
  lastResult: 'guessed' | 'skipped' | undefined,
): WordSwapState {
  if (state.word === word) return state
  const exit: WordExit | null = lastResult === 'guessed' ? 'correct' : lastResult === 'skipped' ? 'skip' : null
  return {
    word,
    leaving: exit && state.word ? { word: state.word, exit } : null,
    generation: state.generation + 1,
  }
}

function normalizeGuess(text: string): string {
  return text.normalize('NFKC').trim().toLocaleLowerCase()
}

/**
 * Whether a typed guess is one of the words the describer has marked guessed.
 * Alias has no server-side guess check – the describer presses "Guessed" – so
 * this is how the feed knows which bubble to celebrate.
 */
export function guessMatchesWord(text: string, guessedWords: readonly string[]): boolean {
  const guess = normalizeGuess(text)
  if (!guess) return false
  return guessedWords.some((word) => normalizeGuess(word) === guess)
}
