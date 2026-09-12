/**
 * The design tokens the dev theme panel can move, and the maths it moves them
 * with (`/dev/theme`).
 *
 * Boardly's whole visual language is 21 colour custom properties in `:root`,
 * eight of which `html.dark` redefines. There are no radius, shadow or spacing
 * tokens — those are written into the rules — so the panel is a colour tool,
 * and the useful control is HSL rather than a hex field: hue and saturation
 * are what you move to make a palette feel like a different product, and a hex
 * picker makes that a guessing game.
 *
 * Nothing here imports React or touches the DOM, so the export can be tested.
 */

export type ThemeVariant = 'light' | 'dark'

export type TokenGroup = 'accent' | 'ink' | 'surface'

export interface ThemeToken {
  /** The custom property, without the leading `--`. */
  name: string
  group: TokenGroup
  /** What it is for, shown under the control — the panel is also documentation. */
  note: string
  /** Value in `:root`. */
  light: string
  /**
   * Value in `html.dark`, when the token is redefined there. `null` means the
   * light value is used in both themes — the accents, deliberately: they do not
   * flip, which is why `--bd-ink-on-accent` exists.
   */
  dark: string | null
}

/**
 * Source of truth: `app/globals.css` lines 7-31 (`:root`) and 35-42
 * (`html.dark`). `--bd-btn-ink` is excluded — it is an alias for `--bd-ink`,
 * not a colour of its own — and so is `--bd-font-display`, which is a font
 * stack, and `--bd-header-h`, which is a length.
 */
export const THEME_TOKENS: readonly ThemeToken[] = [
  { name: 'bd-coral', group: 'accent', note: 'Primary accent: buttons, the brand mark, tic-tac-toe', light: '#FF6B5B', dark: null },
  { name: 'bd-coral-deep', group: 'accent', note: 'Coral text and icons on a light fill', light: '#E04B3B', dark: null },
  { name: 'bd-mint', group: 'accent', note: 'Success, memory, the ready state', light: '#4FC9A6', dark: null },
  { name: 'bd-mint-deep', group: 'accent', note: 'Mint text and icons on a light fill', light: '#2FA787', dark: null },
  { name: 'bd-sun', group: 'accent', note: 'Yahtzee, highlights, the win badge', light: '#FFC44D', dark: null },
  { name: 'bd-sun-deep', group: 'accent', note: 'Sun text and icons on a light fill', light: '#E5A82E', dark: null },
  { name: 'bd-lav', group: 'accent', note: 'Spy, rock paper scissors, planned games', light: '#9B8CFF', dark: null },
  { name: 'bd-lav-mid', group: 'accent', note: 'Lavender between the base and the deep', light: '#8B7DFF', dark: null },
  { name: 'bd-lav-deep', group: 'accent', note: 'Lavender text and icons on a light fill', light: '#7867E8', dark: null },
  { name: 'bd-sky', group: 'accent', note: 'Connect four, links, the info state', light: '#6BC1F0', dark: null },
  { name: 'bd-premium', group: 'accent', note: 'The crown and every premium marker', light: '#F59E0B', dark: null },

  { name: 'bd-ink', group: 'ink', note: 'Body text, borders, the hard shadow', light: '#1F1B16', dark: '#F0E8DB' },
  { name: 'bd-ink-soft', group: 'ink', note: 'Secondary text', light: '#4A3F33', dark: '#B5A494' },
  { name: 'bd-ink-muted', group: 'ink', note: 'Hints, placeholders, disabled', light: '#8A7A66', dark: '#7A6E62' },
  { name: 'bd-ink-on-accent', group: 'ink', note: 'Anything drawn on a coloured fill. Does NOT flip — that is the point', light: '#1F1B16', dark: null },

  { name: 'bd-bg', group: 'surface', note: 'Page background', light: '#FBF6EE', dark: '#1E1B17' },
  { name: 'bd-bg2', group: 'surface', note: 'Recessed surfaces: chips, wells', light: '#F2E9D8', dark: '#2B2720' },
  { name: 'bd-card-warm', group: 'surface', note: 'Card background', light: '#FFF8EC', dark: '#242018' },
  { name: 'bd-input-bg', group: 'surface', note: 'Input and field background', light: '#ffffff', dark: '#2B2720' },
  { name: 'bd-line', group: 'surface', note: 'Hairline borders and dividers', light: '#E8DDC8', dark: '#3A3530' },
]

export const GROUP_LABELS: Record<TokenGroup, string> = {
  accent: 'Accents',
  ink: 'Ink',
  surface: 'Surfaces',
}

/** The value a token has in a variant before anything is moved. */
export function defaultValue(token: ThemeToken, variant: ThemeVariant): string {
  return variant === 'dark' ? token.dark ?? token.light : token.light
}

/** Whether the token is redefined in `html.dark` — decides which block it exports to. */
export function isThemeScoped(token: ThemeToken): boolean {
  return token.dark !== null
}

// ---------------------------------------------------------------------------
// Colour maths. Hex in, hex out, HSL in between, because HSL is what the
// sliders move.
// ---------------------------------------------------------------------------

export interface Hsl {
  /** 0-360 */
  h: number
  /** 0-100 */
  s: number
  /** 0-100 */
  l: number
}

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16) / 255
  const g = parseInt(full.slice(2, 4), 16) / 255
  const b = parseInt(full.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min

  if (d === 0) return { h: 0, s: 0, l: round(l * 100) }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6

  return { h: round(h * 360), s: round(s * 100), l: round(l * 100) }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360 / 360
  const sat = clamp(s, 0, 100) / 100
  const light = clamp(l, 0, 100) / 100

  if (sat === 0) {
    const v = channel(light)
    return `#${v}${v}${v}`
  }

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
  const p = 2 * light - q
  const r = hueToRgb(p, q, hue + 1 / 3)
  const g = hueToRgb(p, q, hue)
  const b = hueToRgb(p, q, hue - 1 / 3)
  return `#${channel(r)}${channel(g)}${channel(b)}`
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

function channel(value: number): string {
  return Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, '0').toUpperCase()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value)
}

export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
}

/**
 * Shift hue and scale saturation on one colour. This is the control that
 * actually answers "make it feel like a different product": moving every
 * accent by the same amount keeps the palette's relationships and changes its
 * character, which picking eleven hexes by hand does not.
 */
export function adjust(hex: string, hueShift: number, satScale: number): string {
  const hsl = hexToHsl(hex)
  // A neutral stays neutral: rotating the hue of a grey is a no-op that would
  // otherwise surprise anyone who dragged the global slider.
  if (hsl.s === 0) return hex.toUpperCase()
  return hslToHex({ h: hsl.h + hueShift, s: clamp(hsl.s * satScale, 0, 100), l: hsl.l })
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ThemeValues = Record<string, string>

/** What changed, per variant, against the values in `globals.css`. */
export function changedTokens(values: ThemeValues, variant: ThemeVariant): ThemeToken[] {
  return THEME_TOKENS.filter((token) => {
    const next = values[token.name]
    return typeof next === 'string' && next.toLowerCase() !== defaultValue(token, variant).toLowerCase()
  })
}

/**
 * The diff, as CSS ready to paste into `app/globals.css`. Only changed tokens,
 * split into the two blocks they actually live in — a token the dark theme does
 * not redefine must not appear under `html.dark`, or it would start flipping
 * and the `--bd-ink-on-accent` lesson gets relearned the hard way.
 */
export function toCss(light: ThemeValues, dark: ThemeValues): string {
  const lightChanged = changedTokens(light, 'light')
  const darkChangedAll = changedTokens(dark, 'dark')
  const darkChanged = darkChangedAll.filter(isThemeScoped)
  const skipped = darkChangedAll.filter((token) => !isThemeScoped(token))

  // The note comes first because it is the only case where a change the user
  // made produces no CSS. Returning "nothing changed" here would tell them
  // their dark-tab edit landed somewhere, when it landed nowhere.
  const note = skipped.length
    ? `/* Not exported: ${skipped.map((t) => `--${t.name}`).join(', ')} — ` +
      `not redefined in html.dark, so a dark-only value would make ` +
      `${skipped.length === 1 ? 'it flip' : 'them flip'} between themes. ` +
      `Change ${skipped.length === 1 ? 'it' : 'them'} in the light tab instead. */`
    : ''

  if (lightChanged.length === 0 && darkChanged.length === 0) {
    return note || '/* Nothing changed yet. */'
  }

  const width = Math.max(
    0,
    ...[...lightChanged, ...darkChanged].map((token) => token.name.length + 3)
  )
  const line = (token: ThemeToken, values: ThemeValues) =>
    `  --${token.name}:${' '.repeat(Math.max(1, width - token.name.length - 2))}${values[token.name].toUpperCase()};`

  const blocks: string[] = []
  if (lightChanged.length > 0) {
    blocks.push(`:root {\n${lightChanged.map((t) => line(t, light)).join('\n')}\n}`)
  }
  if (darkChanged.length > 0) {
    blocks.push(`html.dark {\n${darkChanged.map((t) => line(t, dark)).join('\n')}\n}`)
  }

  return blocks.join('\n\n') + (note ? `\n\n${note}` : '')
}
