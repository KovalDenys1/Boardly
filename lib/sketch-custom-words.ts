import type { SketchWord } from '@/lib/games/sketch-and-guess-words'
import { readLocal, writeLocal } from '@/lib/safe-storage'

export const SKETCH_CUSTOM_WORDS_MIN = 10
export const SKETCH_CUSTOM_WORDS_MAX = 200
export const SKETCH_CUSTOM_WORD_MAX_LENGTH = 32

export interface SketchCustomWordsSetting {
  /** What the host typed, kept as typed so the box reads back the same. */
  text: string
  /** Only these words, or these mixed into the bank. */
  only: boolean
}

/**
 * The host's list, one word or phrase per comma or line: trimmed, inner spaces
 * collapsed, repeats dropped regardless of case, anything longer than 32
 * characters left out. Used on both sides, so the box can say how many will
 * count and the server never trusts what a client already cleaned.
 */
export function parseSketchCustomWords(text: unknown): string[] {
  if (typeof text !== 'string') return []
  const seen = new Set<string>()
  const words: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const word = raw.replace(/\s+/g, ' ').trim()
    if (!word || word.length > SKETCH_CUSTOM_WORD_MAX_LENGTH) continue
    const key = word.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    words.push(word)
    if (words.length >= SKETCH_CUSTOM_WORDS_MAX) break
  }
  return words
}

/** The list as the engine takes it from `config.rules`, or null when it is too short to play. */
export function resolveSketchCustomWords(rules: unknown): { words: string[]; only: boolean } | null {
  if (!rules || typeof rules !== 'object') return null
  const { customWords, customWordsOnly } = rules as { customWords?: unknown; customWordsOnly?: unknown }
  const words = parseSketchCustomWords(Array.isArray(customWords) ? customWords.filter((w) => typeof w === 'string').join('\n') : customWords)
  if (words.length < SKETCH_CUSTOM_WORDS_MIN) return null
  return { words, only: customWordsOnly === true }
}

/** A custom word matches exactly as typed, in every site language: there is nothing to translate. */
export function toSketchCustomWord(word: string, index: number): SketchWord {
  return { id: `custom-${index}`, en: [word], no: [word], ru: [word], uk: [word] }
}

const STORAGE_KEY = 'boardly_sketch_custom_words'

export function readSketchCustomWordsSetting(): SketchCustomWordsSetting {
  try {
    const parsed = JSON.parse(readLocal(STORAGE_KEY) ?? 'null') as Partial<SketchCustomWordsSetting> | null
    if (parsed && typeof parsed.text === 'string') return { text: parsed.text, only: parsed.only === true }
  } catch {
    // A damaged entry is the same as none.
  }
  return { text: '', only: false }
}

export function writeSketchCustomWordsSetting(setting: SketchCustomWordsSetting): void {
  writeLocal(STORAGE_KEY, JSON.stringify(setting))
}

/** What the host's start request adds to `config.rules`, or nothing when the list is too short. */
export function sketchCustomWordsRules(setting: SketchCustomWordsSetting = readSketchCustomWordsSetting()): Record<string, unknown> {
  const words = parseSketchCustomWords(setting.text)
  if (words.length < SKETCH_CUSTOM_WORDS_MIN) return {}
  return { customWords: words, customWordsOnly: setting.only }
}
