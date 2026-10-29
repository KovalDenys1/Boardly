/**
 * Rules for scripts/audit-design-tokens.ts, kept free of side effects so the tests can import them.
 */

// Tailwind's default neutrals and blues, with any variant prefix (dark:, hover:, md:...).
// `bd-sky`, `bd-lav` and the other tokens never match: the colour must follow a utility and be
// followed by a shade number.
export const LEGACY_CLASS =
  /(?<![\w-])(?:[a-z0-9]+:)*(?:bg|text|border|from|to|via|ring|outline|divide|placeholder|shadow|fill|stroke|accent|caret|decoration)-(?:slate|gray|zinc|neutral|stone|blue|indigo)-\d{2,3}(?:\/\d{1,3})?(?![\w-])/g

const ACCENT = '(?:coral|mint|lav|sun|sky)'

/**
 * An accent fill or its -deep shade written as a text colour: 1.6-4.0:1 on the light surfaces
 * (#1457 S8). Text takes --bd-<accent>-text, which holds 4.5:1 in both themes. A `dark:` variant is
 * left alone, since the fills are light enough on the dark surfaces.
 */
const ACCENT_TEXT_CLASS = new RegExp(
  String.raw`(?<![\w-])((?:[a-z0-9-]+:)*)text-(?:bd-${ACCENT}(?:-deep|-mid)?|\(--bd-${ACCENT}(?:-deep|-mid)?\)|\[color:var\(--bd-${ACCENT}(?:-deep|-mid)?\)\]|bd-premium|amber-[456]00)(?![\w-])`,
  'g',
)
const ACCENT_TEXT_STYLE = new RegExp(String.raw`\bcolor:\s*['"]var\(--bd-(?:${ACCENT}-deep|premium)\)['"]`)

/** 1-based line numbers of accent text in a TSX/TS source, minus lines an `accent-text-allow` comment exempts. */
export function accentTextLines(src: string): number[] {
  const lines = src.split('\n')
  const hits: number[] = []
  lines.forEach((line, i) => {
    const classHit = [...line.matchAll(ACCENT_TEXT_CLASS)].some((m) => !m[1].split(':').includes('dark'))
    if (!classHit && !ACCENT_TEXT_STYLE.test(line)) return
    if (/accent-text-allow/.test(`${lines[i - 1] ?? ''}\n${line}`)) return
    hits.push(i + 1)
  })
  return hits
}
