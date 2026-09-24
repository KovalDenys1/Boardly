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

/** Default step between staggered rows, and the longest a whole reveal may take to start its last step. */
export const STAGGER_STEP_MS = 70
export const STAGGER_MAX_TOTAL_MS = 840

/**
 * A staggered reveal of `lastStep + 1` steps (0..lastStep). Each step starts
 * `stepMs` after the one before it – unless that would push the last step past
 * `maxTotalMs`, in which case the spacing shrinks so the whole sequence fits
 * (#1175 review). It never clamps: a clamp made every step past the cap start
 * at the same moment, so a long Alias turn fired its last words, the turn
 * score and the team total together. Shrinking keeps the order.
 */
export function staggerSpacingMs(lastStep: number, stepMs = STAGGER_STEP_MS, maxTotalMs = STAGGER_MAX_TOTAL_MS): number {
  if (!Number.isFinite(lastStep) || lastStep <= 0) return stepMs
  return Math.min(stepMs, maxTotalMs / lastStep)
}

/** Delay of `step` within a reveal whose last step is `lastStep`. */
export function staggerDelayMs(step: number, lastStep: number, stepMs = STAGGER_STEP_MS, maxTotalMs = STAGGER_MAX_TOTAL_MS): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  return Math.round(step * staggerSpacingMs(Math.max(lastStep, step), stepMs, maxTotalMs))
}

export function staggerStyle(step: number, lastStep: number, stepMs?: number, maxTotalMs?: number): React.CSSProperties {
  return { animationDelay: `${staggerDelayMs(step, lastStep, stepMs, maxTotalMs)}ms` }
}

/**
 * Of `ids`, the ones that are news: not there when the list first loaded
 * (`baseline`, null while nothing has loaded) and not yet animated
 * (`settled`). The per-entry counterpart of `isFreshKey`, for a list where any
 * entry – not just the newest – can change into the state that animates.
 */
export function isFreshId(id: string, baseline: ReadonlySet<string> | null, settled: ReadonlySet<string>): boolean {
  if (!baseline) return false
  return !baseline.has(id) && !settled.has(id)
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

/**
 * Guess the Spy: identifies one pass of the questioning turn, for the roster
 * row's nudge. A new questioner changes it, and so does the same questioner
 * coming round again (the history grew in between); `null` outside the
 * questioning phase. Fed to `useFreshKey`, so only a pass seen live nudges.
 */
export function spyTurnPassKey(
  isQuestioning: boolean,
  round: number,
  historyLength: number,
  questionerId: string | null | undefined,
): string | null {
  if (!isQuestioning || !questionerId) return null
  return `${round}:${historyLength}:${questionerId}`
}
