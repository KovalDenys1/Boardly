import fs from 'fs'
import path from 'path'
import { LOBBY_THEMES, LOBBY_THEME_IDS, getThemePageStyle } from '@/lib/lobby-themes'

// WCAG contrast of the colour tokens, read from app/globals.css so a value edited there is checked here.

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

function hexTokens(startMarker: string): Record<string, string> {
  const start = css.indexOf(startMarker)
  if (start < 0) throw new Error(`no "${startMarker}" in globals.css`)
  const body = css.slice(start, css.indexOf('\n}', start))
  return Object.fromEntries([...body.matchAll(/(--bd-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]]))
}

// The design-system :root, not the earlier one that holds only Tailwind's breakpoints.
const light = hexTokens(':root {\n  --bd-bg:')
const THEMES = { light, dark: { ...light, ...hexTokens('\nhtml.dark {\n  --bd-bg:') } }

function rgb(hex: string): number[] {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** `fg` at `alpha` over `bg`, the way a Tailwind `bg-bd-sun/25` tint renders. */
function tint(fg: string, alpha: number, bg: string): string {
  const f = rgb(fg)
  const b = rgb(bg)
  return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}

const AA = 4.5

/** Every pair below 4.5:1, labelled, so a failure names the pair and its ratio. */
function below(pairs: Array<[label: string, fg: string, bg: string]>): string[] {
  return pairs.filter(([, fg, bg]) => ratio(fg, bg) < AA).map(([label, fg, bg]) => `${label}: ${ratio(fg, bg).toFixed(2)}:1`)
}

describe.each(Object.entries(THEMES))('%s theme tokens', (_name, tokens) => {
  const v = (name: string) => {
    const value = tokens[`--bd-${name}`]
    if (!value) throw new Error(`--bd-${name} is not a hex token`)
    return value
  }

  it('body text, secondary text and captions read on the page, the cards and the inputs', () => {
    const pairs: Array<[string, string, string]> = []
    for (const ink of ['ink', 'ink-soft', 'ink-muted']) {
      for (const surface of ['bg', 'bg2', 'card', 'card-warm', 'input-bg']) pairs.push([`${ink} on ${surface}`, v(ink), v(surface)])
    }
    expect(below(pairs)).toEqual([])
  })

  it('text on the inverse slab reads, and so does every accent the marquee writes on it', () => {
    const fgs = ['ink-on-inverse', 'sun', 'mint', 'sky', 'coral', 'lav']
    expect(below(fgs.map((fg) => [`${fg} on inverse`, v(fg), v('inverse')]))).toEqual([])
  })

  it('keeps the inverse slab dark in both themes', () => {
    expect(luminance(v('inverse'))).toBeLessThan(0.05)
  })

  it('reads ink-on-accent on every accent fill, and the sun mark on the logo tile', () => {
    const fills = ['coral', 'mint', 'sun', 'lav', 'sky']
    expect(below([...fills.map((f): [string, string, string] => [`on-accent on ${f}`, v('ink-on-accent'), v(f)]), ['sun on logo-tile', v('sun'), v('logo-tile')]])).toEqual([])
  })

  it('reads sun-text on a sun tint over the page and the cards', () => {
    expect(below(['bg', 'card', 'card-warm'].map((s) => [`sun-text on sun/25 over ${s}`, v('sun-text'), tint(v('sun'), 0.25, v(s))]))).toEqual([])
  })
})

describe('dark accent text', () => {
  const v = (name: string) => THEMES.dark[`--bd-${name}`]

  it.each(['coral', 'mint', 'lav'])('%s-text reads on the dark surfaces and on its own 15 %% tint', (accent) => {
    const text = v(`${accent}-text`)
    const pairs: Array<[string, string, string]> = []
    for (const s of ['bg', 'bg2', 'card']) {
      pairs.push([`on ${s}`, text, v(s)], [`on ${accent}/15 over ${s}`, text, tint(v(accent), 0.15, v(s))])
    }
    expect(below(pairs)).toEqual([])
  })
})

/**
 * The -deep shades draw the border and hard shadow of a filled button, a checked box and
 * the focus ring, so they hold their own floors: in every theme, lobby themes included.
 */
const SHADE_SURFACES: Array<[name: string, tokens: Record<string, string>, page: string]> = [
  ['light', THEMES.light, THEMES.light['--bd-bg']],
  ['dark', THEMES.dark, THEMES.dark['--bd-bg']],
  ...LOBBY_THEME_IDS.filter((id) => id !== 'default').map((id): [string, Record<string, string>, string] => [
    `lobby ${id}`,
    { ...THEMES.light, ...(getThemePageStyle(id) as Record<string, string>) },
    LOBBY_THEMES[id].bg,
  ]),
]

describe.each(SHADE_SURFACES)('%s: accent shades', (_name, tokens, page) => {
  it.each(['coral', 'mint', 'lav'])('%s-deep stays a visible step darker than its fill', (accent) => {
    const shade = tokens[`--bd-${accent}-deep`]
    const fill = tokens[`--bd-${accent}`]
    expect(luminance(shade)).toBeLessThan(luminance(fill))
    expect(ratio(shade, fill)).toBeGreaterThanOrEqual(1.3)
  })

  it('a checked box draws its white tick on lav-deep at 3:1 or more', () => {
    expect(ratio('#FFFFFF', tokens['--bd-lav-deep'])).toBeGreaterThanOrEqual(3)
  })

  // On an ink-filled control only light and dark are pinned (below): Ocean's ink was 2.72:1 before #1538 too.
  it.each(['page', '--bd-bg2', '--bd-card', '--bd-input-bg'])('the lav-deep focus ring reaches 3:1 on %s', (surface) => {
    expect(ratio(tokens['--bd-lav-deep'], surface === 'page' ? page : tokens[surface])).toBeGreaterThanOrEqual(3)
  })
})

describe.each(Object.entries(THEMES))('%s: focus ring on a control filled with ink', (_name, tokens) => {
  // The Roll button, the drawer's ink buttons and a selected plate are ink: cream in dark.
  it('reaches 3:1', () => {
    expect(ratio(tokens['--bd-lav-deep'], tokens['--bd-ink'])).toBeGreaterThanOrEqual(3)
  })
})

describe('lobby themes', () => {
  it.each(LOBBY_THEME_IDS.filter((id) => id !== 'default'))('%s sets readable accent text and inverse slab values', (id) => {
    const theme = LOBBY_THEMES[id]
    const style = getThemePageStyle(id) as Record<string, string>
    const pairs: Array<[string, string, string]> = [['on-inverse on inverse', style['--bd-ink-on-inverse'], style['--bd-inverse']]]
    for (const accent of ['coral', 'mint', 'lav']) {
      const text = style[`--bd-${accent}-text`]
      expect(text).toMatch(/^#[0-9A-F]{6}$/i)
      if (theme.dark) pairs.push([`${accent}-text on bg`, text, theme.bg], [`${accent}-text on bg2`, text, theme.bg2])
    }
    expect(below(pairs)).toEqual([])
  })
})
