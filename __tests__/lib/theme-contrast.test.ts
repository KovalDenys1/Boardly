import fs from 'fs'
import path from 'path'
import { LOBBY_THEMES, LOBBY_THEME_IDS, getThemePageStyle } from '@/lib/lobby-themes'

// WCAG contrast of the colour tokens, read from app/globals.css so a value edited there is checked here.

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

/** Hex tokens of every top-level `selector { ... }` block, in file order, so a later block overrides an earlier one. */
function hexTokens(selector: string): Record<string, string> {
  const blocks = [...css.matchAll(new RegExp(`^${selector.replace('.', '\\.')} \\{\\n([^}]*)\\n\\}`, 'gm'))]
  if (blocks.length === 0) throw new Error(`no "${selector}" block in globals.css`)
  return Object.fromEntries(blocks.flatMap((b) => [...b[1].matchAll(/(--bd-[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map((m) => [m[1], m[2]])))
}

const light = hexTokens(':root')
const THEMES = { light, dark: { ...light, ...hexTokens('html.dark') } }

type Colour = string | number[]
function rgb(colour: Colour): number[] {
  if (Array.isArray(colour)) return colour
  const h = colour.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
function luminance(colour: Colour): number {
  const [r, g, b] = rgb(colour).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function ratio(a: Colour, b: Colour): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
/** `fg` at `alpha` over `bg`, the way a Tailwind `bg-bd-sun/25` tint renders, unrounded so a pair cannot pass on rounding. */
function tint(fg: string, alpha: number, bg: string): number[] {
  const f = rgb(fg)
  const b = rgb(bg)
  return f.map((c, i) => c * alpha + b[i] * (1 - alpha))
}

const AA = 4.5

/** Every pair below 4.5:1, labelled, so a failure names the pair and its ratio. */
function below(pairs: Array<[label: string, fg: Colour, bg: Colour]>): string[] {
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

const TEXT_SURFACES = ['bg', 'bg2', 'card', 'card-warm', 'input-bg']

describe.each(Object.entries(THEMES))('%s accent text', (_name, tokens) => {
  const v = (name: string) => tokens[`--bd-${name}`]

  // Chips, badges and hover plates put the text on its own accent at 10-20 %.
  it.each(['coral', 'mint', 'lav', 'sun', 'sky'])('%s-text reads on every surface and on its own tint', (accent) => {
    const text = v(`${accent}-text`)
    const pairs: Array<[string, Colour, Colour]> = []
    for (const s of TEXT_SURFACES) {
      pairs.push([`on ${s}`, text, v(s)])
      for (const alpha of [0.1, 0.15, 0.2]) pairs.push([`on ${accent}/${alpha * 100} over ${s}`, text, tint(v(accent), alpha, v(s))])
    }
    expect(below(pairs)).toEqual([])
  })
})

/**
 * Errors, confirmations and warnings (#1550): the text on every surface and on its own tinted ground,
 * and the solid colour – an icon, a strength bar, a field's edge in that state – at 3:1, in every theme.
 */
const STATUSES = ['danger', 'success', 'warning']

function statusFailures(tokens: Record<string, string>, surfaces: Array<[string, string]>): string[] {
  const pairs: Array<[string, Colour, Colour]> = []
  const solid: string[] = []
  for (const status of STATUSES) {
    const text = tokens[`--bd-${status}-text`]
    const fill = tokens[`--bd-${status}`]
    const ground = tokens[`--bd-${status}-bg`]
    if (![text, fill, ground, tokens[`--bd-${status}-border`]].every((v) => /^#[0-9A-F]{6}$/i.test(v ?? ''))) {
      solid.push(`--bd-${status}, -text, -bg and -border must all be hex tokens`)
      continue
    }
    for (const [name, surface] of [...surfaces, [`${status}-bg`, ground] as [string, string]]) {
      pairs.push([`${status}-text on ${name}`, text, surface])
    }
    for (const [name, surface] of surfaces) {
      if (ratio(fill, surface) < 3) solid.push(`${status} on ${name}: ${ratio(fill, surface).toFixed(2)}:1`)
    }
  }
  const onDanger = tokens['--bd-ink-on-danger']
  if (!onDanger) solid.push('--bd-ink-on-danger is not a hex token')
  else pairs.push(['ink-on-danger on danger', onDanger, tokens['--bd-danger']])
  return [...below(pairs), ...solid]
}

describe.each(Object.entries(THEMES))('%s status colours', (_name, tokens) => {
  it('read on the page, the cards, the inputs and their own ground', () => {
    expect(statusFailures(tokens, TEXT_SURFACES.map((s) => [s, tokens[`--bd-${s}`]]))).toEqual([])
  })
})

describe('lobby themes: status colours', () => {
  it.each(LOBBY_THEME_IDS.filter((id) => id !== 'default'))('%s sets status colours that read on its surfaces', (id) => {
    const theme = LOBBY_THEMES[id]
    const style = getThemePageStyle(id) as Record<string, string>
    const surfaces: Array<[string, string]> = [['bg', theme.bg], ['bg2', theme.bg2], ['card', style['--bd-card']], ['input-bg', style['--bd-input-bg']]]
    expect(statusFailures(style, surfaces)).toEqual([])
  })
})

/**
 * Boards keep their edge in dark mode (#1567): Connect Four's dark frame carries a rim in --bd-board-line,
 * Ludo draws its grid in it on --bd-board-cell, and the Memory card back is the same card in every theme.
 */
const BOARD_THEMES: Array<[name: string, tokens: Record<string, string>]> = [
  ['light', THEMES.light],
  ['dark', THEMES.dark],
  ...LOBBY_THEME_IDS.filter((id) => id !== 'default').map((id): [string, Record<string, string>] => [
    `lobby ${id}`,
    { ...THEMES.light, '--bd-bg': LOBBY_THEMES[id].bg, ...(getThemePageStyle(id) as Record<string, string>) },
  ]),
]

describe.each(BOARD_THEMES)('%s: board edges', (_name, tokens) => {
  it.each(['--bd-card', '--bd-card-warm', '--bd-bg'])('the board line stands 3:1 off %s, where a board sits', (surface) => {
    expect(ratio(tokens['--bd-board-line'], tokens[surface])).toBeGreaterThanOrEqual(3)
  })

  it('Ludo grid lines read 3:1 on its cells', () => {
    expect(ratio(tokens['--bd-board-line'], tokens['--bd-board-cell'])).toBeGreaterThanOrEqual(3)
  })
})

describe('board sources', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8')

  it('Connect Four rims its frame in the board line, inside the box', () => {
    expect(read('components/boards/C4Board.tsx')).toMatch(/border: '2px solid var\(--bd-board-line\)'/)
  })

  it('Ludo draws its ground, cells and lines with theme tokens, not light hex', () => {
    const ludo = read('components/boards/LudoBoard.tsx')
    expect(ludo).toMatch(/const BOARD_BG = 'var\(--bd-card-warm\)'/)
    expect(ludo).toMatch(/const CELL_BG = 'var\(--bd-board-cell\)'/)
    expect(ludo).toMatch(/const BOARD_LINE = 'var\(--bd-board-line\)'/)
  })
})

describe('the Memory card back mark', () => {
  const rule = /\.memory-tile-back-mark \{([^}]*)\}/.exec(css)![1]
  const markToken = /(?<![-\w])color:\s*var\((--bd-[a-z-]+)\)/.exec(rule)?.[1] ?? ''
  const plate = /background:\s*rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)/.exec(rule)

  it('is drawn in --bd-ink-on-accent on a white plate over the lav back, the same card in every theme', () => {
    expect(markToken).toBe('--bd-ink-on-accent')
    expect(plate).not.toBeNull()
  })

  it.each(Object.entries(THEMES))('reads 3:1 or more in %s', (_name, tokens) => {
    const ground = tint('#FFFFFF', Number(plate?.[1] ?? 0), tokens['--bd-lav'])
    expect(ratio(tokens[markToken] ?? '#FFFFFF', ground)).toBeGreaterThanOrEqual(3)
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

  // The ring is inset, so on an ink-filled control (the Roll button, the drawer's ink buttons, a selected
  // plate) its neighbours are the ink fill inside and the surface outside.
  it.each(['page', '--bd-bg2', '--bd-card', '--bd-input-bg', '--bd-ink'])('the lav-deep focus ring reaches 3:1 on %s', (surface) => {
    expect(ratio(tokens['--bd-lav-deep'], surface === 'page' ? page : tokens[surface])).toBeGreaterThanOrEqual(3)
  })
})

describe('lobby themes', () => {
  it.each(LOBBY_THEME_IDS.filter((id) => id !== 'default'))('%s sets readable accent text and inverse slab values', (id) => {
    const theme = LOBBY_THEMES[id]
    const style = getThemePageStyle(id) as Record<string, string>
    const pairs: Array<[string, string, string]> = [['on-inverse on inverse', style['--bd-ink-on-inverse'], style['--bd-inverse']]]
    for (const accent of ['coral', 'mint', 'lav', 'sun', 'sky']) {
      const text = style[`--bd-${accent}-text`]
      expect(text).toMatch(/^#[0-9A-F]{6}$/i)
      pairs.push([`${accent}-text on bg`, text, theme.bg], [`${accent}-text on bg2`, text, theme.bg2])
    }
    expect(below(pairs)).toEqual([])
  })

  it.each(LOBBY_THEME_IDS.filter((id) => id !== 'default'))('%s keeps captions at 4.5:1 and field edges at 3:1', (id) => {
    const theme = LOBBY_THEMES[id]
    const style = getThemePageStyle(id) as Record<string, string>
    expect(below([['muted on bg', style['--bd-ink-muted'], theme.bg], ['muted on bg2', style['--bd-ink-muted'], theme.bg2]])).toEqual([])
    expect(style['--bd-input-border']).toMatch(/^#[0-9A-F]{6}$/i)
    for (const surface of [style['--bd-input-bg'], theme.bg, theme.bg2]) {
      expect(ratio(style['--bd-input-border'], surface)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('hover fills under ink-on-accent text', () => {
  it('hold 4.5:1 in both themes', () => {
    const root = path.join(__dirname, '..', '..')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir).flatMap((n) => (fs.statSync(path.join(dir, n)).isDirectory() ? walk(path.join(dir, n)) : n.endsWith('.tsx') ? [path.join(dir, n)] : []))
    const fills = new Set<string>()
    for (const file of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'components'))]) {
      for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
        if (!line.includes('text-bd-ink-on-accent')) continue
        for (const m of line.matchAll(/hover:bg-bd-((?:coral|mint|lav|sun|sky)(?:-[a-z]+)?)\b/g)) fills.add(m[1])
      }
    }
    expect(fills.size).toBeGreaterThan(0)
    const pairs: Array<[string, Colour, Colour]> = []
    for (const [name, tokens] of Object.entries(THEMES)) {
      for (const fill of fills) pairs.push([`${name} ink-on-accent on hover ${fill}`, tokens['--bd-ink-on-accent'], tokens[`--bd-${fill}`]])
    }
    expect(below(pairs)).toEqual([])
  })
})

describe('accent fills in globals.css', () => {
  it('write their text in --bd-ink-on-accent', () => {
    const wrong: string[] = []
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const fill = /background(?:-color)?:[^;]*var\(--bd-(?:coral|mint|lav|sun|sky)\)\s*(?:!important)?\s*;/.test(m[2])
      const color = /(?<![-\w])color:\s*([^;]+);/.exec(m[2])
      if (fill && color && !color[1].includes('--bd-ink-on-accent')) wrong.push(`${m[1].trim()}: ${color[1]}`)
    }
    expect(wrong).toEqual([])
  })
})
