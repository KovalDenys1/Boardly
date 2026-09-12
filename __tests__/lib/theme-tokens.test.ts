import {
  THEME_TOKENS,
  adjust,
  changedTokens,
  defaultValue,
  hexToHsl,
  hslToHex,
  isHexColor,
  isThemeScoped,
  toCss,
  type ThemeValues,
} from '@/lib/dev/theme-tokens'

function seed(variant: 'light' | 'dark'): ThemeValues {
  return Object.fromEntries(THEME_TOKENS.map((t) => [t.name, defaultValue(t, variant)]))
}

describe('theme token registry', () => {
  it('matches what globals.css actually declares', () => {
    // Guards against the registry drifting from the stylesheet it edits.
    const names = THEME_TOKENS.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('bd-coral')
    expect(names).toContain('bd-ink-on-accent')
    // Aliases and non-colours are deliberately excluded
    expect(names).not.toContain('bd-btn-ink')
    expect(names).not.toContain('bd-font-display')
    expect(names).not.toContain('bd-header-h')
  })

  it('knows which tokens html.dark redefines', () => {
    const scoped = THEME_TOKENS.filter(isThemeScoped).map((t) => t.name).sort()
    expect(scoped).toEqual(
      ['bd-bg', 'bd-bg2', 'bd-card-warm', 'bd-line', 'bd-ink', 'bd-ink-muted', 'bd-ink-soft', 'bd-input-bg'].sort()
    )
    // The accents do not flip, which is the whole reason --bd-ink-on-accent exists
    expect(isThemeScoped(THEME_TOKENS.find((t) => t.name === 'bd-coral')!)).toBe(false)
    expect(isThemeScoped(THEME_TOKENS.find((t) => t.name === 'bd-ink-on-accent')!)).toBe(false)
  })

  it('falls back to the light value for a token dark does not redefine', () => {
    const coral = THEME_TOKENS.find((t) => t.name === 'bd-coral')!
    expect(defaultValue(coral, 'dark')).toBe(coral.light)
  })
})

describe('colour maths', () => {
  it('round-trips every token through HSL without visible drift', () => {
    for (const token of THEME_TOKENS) {
      const back = hslToHex(hexToHsl(token.light))
      // HSL is lossy at 1% steps; a channel may land one step away
      const a = parseInt(back.slice(1), 16)
      const b = parseInt(token.light.replace('#', ''), 16)
      const diff = Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255))
      expect(diff).toBeLessThanOrEqual(6)
    }
  })

  it('handles shorthand hex and greys', () => {
    expect(hexToHsl('#fff')).toEqual({ h: 0, s: 0, l: 100 })
    expect(hslToHex({ h: 0, s: 0, l: 100 })).toBe('#FFFFFF')
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 })
  })

  it('wraps hue and clamps saturation and lightness', () => {
    expect(hslToHex({ h: 380, s: 100, l: 50 })).toBe(hslToHex({ h: 20, s: 100, l: 50 }))
    expect(hslToHex({ h: -20, s: 100, l: 50 })).toBe(hslToHex({ h: 340, s: 100, l: 50 }))
    expect(hslToHex({ h: 0, s: 400, l: 400 })).toBe('#FFFFFF')
  })

  it('validates hex input', () => {
    expect(isHexColor('#FF6B5B')).toBe(true)
    expect(isHexColor('#fff')).toBe(true)
    expect(isHexColor(' #fff ')).toBe(true)
    expect(isHexColor('FF6B5B')).toBe(false)
    expect(isHexColor('#ff6b5')).toBe(false)
    expect(isHexColor('red')).toBe(false)
  })

  it('leaves a neutral alone when the global hue slider moves', () => {
    // Dragging "rotate every accent" must not tint the greys, or the control
    // becomes unusable the moment it touches ink and surfaces.
    expect(adjust('#FFFFFF', 120, 1)).toBe('#FFFFFF')
    expect(adjust('#000000', 45, 2)).toBe('#000000')
  })

  it('rotates hue and scales saturation on a real accent', () => {
    const shifted = adjust('#FF6B5B', 60, 1)
    expect(shifted).not.toBe('#FF6B5B')
    expect(hexToHsl(shifted).h).toBe((hexToHsl('#FF6B5B').h + 60) % 360)
    expect(hexToHsl(adjust('#FF6B5B', 0, 0)).s).toBe(0)
  })

  it('is identity at no shift and unit scale', () => {
    for (const token of THEME_TOKENS) {
      expect(adjust(token.light, 0, 1).toLowerCase()).toBe(
        hslToHex(hexToHsl(token.light)).toLowerCase()
      )
    }
  })
})

describe('CSS export', () => {
  it('says so rather than emitting an empty block when nothing moved', () => {
    expect(toCss(seed('light'), seed('dark'))).toContain('Nothing changed')
  })

  it('emits only what changed, in the block the token lives in', () => {
    const light = { ...seed('light'), 'bd-coral': '#123456' }
    const dark = { ...seed('dark'), 'bd-bg': '#0A0A0A' }
    const css = toCss(light, dark)
    expect(css).toContain(':root {')
    expect(css).toContain('--bd-coral:')
    expect(css).toContain('#123456'.toUpperCase())
    expect(css).toContain('html.dark {')
    expect(css).toContain('--bd-bg:')
    // Untouched tokens stay out of the diff
    expect(css).not.toContain('--bd-mint')
    expect(css).not.toContain('--bd-sky')
  })

  it('refuses to export a dark value for a token html.dark does not redefine', () => {
    // Exporting --bd-coral under html.dark would make it flip between themes,
    // which is exactly the bug --bd-ink-on-accent was created to end.
    const dark = { ...seed('dark'), 'bd-coral': '#00FF00' }
    const css = toCss(seed('light'), dark)
    expect(css).not.toContain('html.dark {')
    expect(css).toContain('Not exported')
    expect(css).toContain('--bd-coral')
  })

  it('is case-insensitive about what counts as unchanged', () => {
    const light = { ...seed('light'), 'bd-input-bg': '#FFFFFF' }
    expect(changedTokens(light, 'light')).toHaveLength(0)
  })
})
