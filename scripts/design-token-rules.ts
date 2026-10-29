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

// A focus ring or outline colour: anything but lav-deep is off the one focus colour (#1457 S5).
const FOCUS_COLOUR = /(?<![\w-])(?:[a-z0-9-]+:)*focus(?:-visible|-within)?:(?:[a-z0-9-]+:)*(?:ring|outline)-((?:bd-[a-z-]+|\(--[a-z-]+\)|\[[^\]]+\]|white|black|[a-z]+-\d{2,3})(?:\/\d+)?)!?(?![\w-])/g
const NOT_A_COLOUR = /^(?:offset-.*|\d+|inset|solid|dashed|dotted|double|hidden|none|\[\d+(?:\.\d+)?px\])$/

/** 1-based line numbers of a focus ring or outline drawn in a colour other than --bd-lav-deep. */
export function focusColourLines(src: string): number[] {
  const hits: number[] = []
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(FOCUS_COLOUR)) {
      if (NOT_A_COLOUR.test(m[1]) || m[1] === 'bd-lav-deep') continue
      hits.push(i + 1)
      return
    }
  })
  return hits
}

/** The `bd-*` colour utility names globals.css defines, from `--color-bd-*` in either @theme block. */
export function colourUtilities(globalsCss: string): Set<string> {
  return new Set([...globalsCss.matchAll(/--color-(bd-[a-z0-9-]+):/g)].map((m) => m[1]))
}

const COLOUR_PROPS = '(?:bg|text|border(?:-[trblxy])?|ring|outline|fill|stroke|from|to|via|decoration|divide|placeholder|accent|caret)'
const VAR_SHORTHAND = new RegExp(String.raw`(?<![\w-])(?:[a-z0-9-]+:)*${COLOUR_PROPS}-(?:\(--(bd-[a-z0-9-]+)\)|\[(?:color:)?var\(--(bd-[a-z0-9-]+)\)\])`, 'g')

/** 1-based lines that spell a colour as `-(--bd-x)` or `-[var(--bd-x)]` where the `bd-x` utility exists (#1457 S12). */
export function varShorthandLines(src: string, utilities: Set<string>): number[] {
  const hits: number[] = []
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(VAR_SHORTHAND)) {
      if (utilities.has(m[1] ?? m[2])) {
        hits.push(i + 1)
        return
      }
    }
  })
  return hits
}

/** The light hex values of the --bd-* colour tokens in the design-system :root, upper-cased. */
export function tokenHexValues(globalsCss: string): Set<string> {
  const start = globalsCss.indexOf(':root {\n  --bd-bg:')
  const root = globalsCss.slice(start, globalsCss.indexOf('\n}', start))
  return new Set([...root.matchAll(/--bd-[a-z0-9-]+:\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => m[1].toUpperCase()))
}

const SHADOW_VALUE = /shadow-\[([^\]]+)\]|boxShadow:\s*[`'"]([^`'"]+)[`'"]/g

/** 1-based lines whose shadow hard-codes a token's hex, which then does not follow dark mode or a lobby theme (#1457 S13). */
export function tokenHexShadowLines(src: string, tokenHex: Set<string>): number[] {
  const hits: number[] = []
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(SHADOW_VALUE)) {
      if ((m[1] ?? m[2]).match(/#[0-9A-Fa-f]{6}\b/g)?.some((hex) => tokenHex.has(hex.toUpperCase()))) {
        hits.push(i + 1)
        return
      }
    }
  })
  return hits
}

const TRANSITION_ALL = /(?<![\w-])(?:[a-z0-9-]+:)*transition-all(?![\w-])/

/**
 * 1-based lines using `transition-all` (#1457 S21). v4's `transition` covers colour, shadow, opacity
 * and transform; `all` also animates width, height and margins, which the motion rules forbid. An
 * animation that does need a layout property names it: `transition-[width]`.
 */
export function transitionAllLines(src: string): number[] {
  const hits: number[] = []
  src.split('\n').forEach((line, i) => {
    if (TRANSITION_ALL.test(line)) hits.push(i + 1)
  })
  return hits
}
