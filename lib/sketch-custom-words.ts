import { normalizeSketchGuess, type SketchWord } from '@/lib/games/sketch-and-guess-words'
import { readLocal, writeLocal } from '@/lib/safe-storage'

export const SKETCH_CUSTOM_WORDS_MIN = 10
export const SKETCH_CUSTOM_WORDS_MAX = 200
export const SKETCH_CUSTOM_WORD_MAX_LENGTH = 32

export interface SketchCustomWordsSetting {
  text: string
  only: boolean
}

const MAX_INPUT_CHARS = 20_000

/** Repeats are judged the way guesses are matched, so "café" and "cafe" are one word, and a word of only symbols none. */
export function parseSketchCustomWords(text: unknown): string[] {
  if (typeof text !== 'string') return []
  const input = text.slice(0, MAX_INPUT_CHARS)
  const seen = new Set<string>()
  const words: string[] = []
  for (const raw of input.split(/[,\n]/)) {
    const word = raw.replace(/\s+/g, ' ').trim()
    if (!word || word.length > SKETCH_CUSTOM_WORD_MAX_LENGTH) continue
    const key = normalizeSketchGuess(word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    words.push(word)
    if (words.length >= SKETCH_CUSTOM_WORDS_MAX) break
  }
  return words
}

export function resolveSketchCustomWords(rules: unknown): { words: string[]; only: boolean } | null {
  if (!rules || typeof rules !== 'object') return null
  const { customWords, customWordsOnly } = rules as { customWords?: unknown; customWordsOnly?: unknown }
  const words = parseSketchCustomWords(
    Array.isArray(customWords)
      ? customWords.slice(0, SKETCH_CUSTOM_WORDS_MAX * 2).filter((w) => typeof w === 'string').map((w) => w.slice(0, 64)).join('\n')
      : customWords,
  )
  if (words.length < SKETCH_CUSTOM_WORDS_MIN) return null
  return { words, only: customWordsOnly === true }
}

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

export function sketchCustomWordsRules(setting: SketchCustomWordsSetting = readSketchCustomWordsSetting()): Record<string, unknown> {
  const words = parseSketchCustomWords(setting.text)
  if (words.length < SKETCH_CUSTOM_WORDS_MIN) return {}
  return { customWords: words, customWordsOnly: setting.only }
}
