/**
 * The client-safe half of the Sketch & Guess word bank (#1082): the shape of a
 * word and how to show it in the viewer's language. The page imports this and
 * never `sketch-and-guess-words.ts`, so the bank itself stays on the server and
 * a browser only ever holds the words the state hands it – the drawer's three
 * choices and chosen word, and everyone's word at the reveal.
 */

export type SketchWordLocale = 'en' | 'no' | 'ru' | 'uk'

export const SKETCH_WORD_LOCALES: readonly SketchWordLocale[] = ['en', 'no', 'ru', 'uk']

export interface SketchWord {
  id: string
  /** First form is the display form; the rest are accepted variants. */
  en: string[]
  no: string[]
  ru: string[]
  uk: string[]
}

export function resolveSketchWordLocale(locale: string | null | undefined): SketchWordLocale {
  const normalized = (locale || '').toLowerCase()
  // `nb` and `nn` are how a browser names Norwegian; the site calls it `no`.
  if (normalized.startsWith('nb') || normalized.startsWith('nn')) return 'no'
  return SKETCH_WORD_LOCALES.find((lang) => normalized === lang || normalized.startsWith(`${lang}-`)) ?? 'en'
}

/** The form a viewer whose UI is in `locale` should be shown, English when that language has none. */
export function sketchWordDisplay(word: Partial<Pick<SketchWord, SketchWordLocale>> | null | undefined, locale: string): string {
  if (!word) return ''
  const lang = resolveSketchWordLocale(locale)
  return word[lang]?.[0] || word.en?.[0] || ''
}
