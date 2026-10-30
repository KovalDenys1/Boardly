import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { LEGACY_CLASS, accentTextLines, colourUtilities, focusColourLines, tokenHexShadowLines, tokenHexValues, transitionAllLines, varShorthandLines } from '../../scripts/design-token-rules'

const globalsCss = readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

describe('accent colour used as text', () => {
  it.each([
    ['a fill as text', '<p className="text-bd-coral">'],
    ['a fill as a hover colour', '<a className="underline hover:text-bd-coral">'],
    ['a shade as text', '<span className="text-xs text-bd-sun-deep">'],
    ['a fill through a variable', '<p className="text-(--bd-coral)">'],
    ['the premium fill', "isPremium ? 'text-bd-premium' : 'text-bd-ink'"],
    ['Tailwind amber', "isPremium ? 'text-amber-500' : ''"],
    ['a shade in an inline style', "<span style={{ color: 'var(--bd-sun-deep)' }}>"],
    ['the premium fill through a ternary', "<span style={{ fontWeight: 600, color: isPremium ? 'var(--bd-premium)' : undefined }}>"],
  ])('flags %s', (_label, line) => {
    expect(accentTextLines(line)).toEqual([1])
  })

  it.each([
    ['the text token', '<p className="text-bd-coral-text">'],
    ['a dark-only variant', '<p className="text-bd-lav-text dark:text-bd-lav">'],
    ['a fill as a background', '<p className="bg-bd-coral text-bd-ink-on-accent">'],
    ['the sun text token', '<p className="text-bd-sun-text">'],
  ])('leaves %s alone', (_label, line) => {
    expect(accentTextLines(line)).toEqual([])
  })

  it('honours an accent-text-allow comment on the line or the one above', () => {
    expect(accentTextLines('{/* accent-text-allow: on the dark skin */}\n<p className="text-bd-coral">')).toEqual([])
  })
})

describe('palette classes', () => {
  const count = (line: string) => (line.match(LEGACY_CLASS) ?? []).length

  it.each([
    ['an error text', '<p className="text-xs text-red-600">'],
    ['a dark-mode patch', '<p className="text-bd-danger-text dark:text-red-300">'],
    ['a success tint', '<div className="bg-emerald-500/10 border-emerald-500/30">'],
    ['a warning gradient', '<div className="bg-linear-to-r/srgb from-amber-50 to-orange-50">'],
    ['a checked box', "success: 'checked:bg-green-600 hover:border-green-500'"],
    ['a rose message', '<p className="text-rose-600">'],
    ['a yellow chip', '<span className="bg-yellow-100 text-teal-700">'],
  ])('counts %s, so the baseline catches a status palette class', (_label, line) => {
    expect(count(line)).toBeGreaterThan(0)
  })

  it('leaves the status tokens alone', () => {
    expect(count('<p className="border-bd-danger-border bg-bd-danger-bg text-bd-danger-text text-bd-success-text bg-bd-warning">')).toBe(0)
  })
})

describe('focus ring colour', () => {
  it.each([
    ['an ink ring', 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-ink'],
    ['a coral outline', 'focus-visible:outline-2 focus-visible:outline-bd-coral!'],
    ['a palette ring', 'focus:ring-2 focus:ring-inset focus:ring-red-500'],
  ])('flags %s', (_label, line) => {
    expect(focusColourLines(line)).toEqual([1])
  })

  it('leaves the lav-deep ring and the width and offset utilities alone', () => {
    expect(focusColourLines('focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:-outline-offset-2')).toEqual([])
  })
})

describe('colour tokens as utilities', () => {
  it('wires every --bd-* colour in :root into @theme inline as a var() link', () => {
    const roots = [...globalsCss.matchAll(/^:root \{\n([^}]*)\n\}/gm)].map((m) => m[1]).join('\n')
    const declared = [...roots.matchAll(/--(bd-[a-z0-9-]+):\s*(?:#|rgba?\(|var\(--bd-)/g)].map((m) => m[1])
    expect(declared).toEqual(expect.arrayContaining(['bd-danger-text', 'bd-success-text', 'bd-warning-text']))
    const inline = globalsCss.slice(globalsCss.indexOf('@theme inline {'))
    const wired = inline.slice(0, inline.indexOf('\n}'))
    expect(declared.filter((name) => !wired.includes(`--color-${name}: var(--${name});`))).toEqual([])
  })

  it('keeps no static hex for a colour that has a --bd-* variable', () => {
    const block = /@theme \{([^]*?)\n\}/.exec(globalsCss)![1]
    const hex = [...block.matchAll(/--color-(bd-[a-z0-9-]+):\s*#/g)].map((m) => m[1]).filter((name) => globalsCss.includes(`--${name}:`))
    expect(hex).toEqual([])
  })

  const utilities = colourUtilities(globalsCss)
  it.each([
    ['a variable spelling', '<p className="text-(--bd-ink)">'],
    ['a bracket spelling', '<div className="bg-[var(--bd-card)]">'],
    ['a typed bracket spelling', '<a className="text-[color:var(--bd-ink-on-accent)]">'],
    ['a variant with opacity', '<div className="hover:bg-(--bd-card-warm)/80">'],
  ])('flags %s of a colour that has a utility', (_label, line) => {
    expect(varShorthandLines(line, utilities)).toEqual([1])
  })

  it('leaves a shadow value and a variable with no utility alone', () => {
    expect(varShorthandLines('<div className="shadow-[0_4px_0_var(--bd-ink)] bg-(--bd-unknown)">', utilities)).toEqual([])
  })
})

describe('shadows', () => {
  const tokenHex = tokenHexValues(globalsCss)

  it('keeps the shadow tokens off hex, and one that names a --bd-* colour in @theme inline so a lobby theme reaches it', () => {
    const inline = /@theme inline \{([^]*?)\n\}/.exec(globalsCss)![1]
    const all = [...globalsCss.matchAll(/--shadow-bd-[a-z0-9-]+:\s*([^;]+);/g)]
    expect(all.length).toBeGreaterThan(0)
    expect(all.filter((m) => /#[0-9A-Fa-f]{3,8}\b/.test(m[1]) || (m[1].includes('var(--bd-') && !inline.includes(m[0]))).map((m) => m[0])).toEqual([])
  })

  it.each([
    ['an arbitrary class', '<span className="shadow-[2px_2px_0_#1F1B16]">'],
    ['an inline style', "style={{ boxShadow: '4px 4px 0 #1F1B16' }}"],
  ])('flags a token colour hard-coded in %s', (_label, line) => {
    expect(tokenHexShadowLines(line, tokenHex)).toEqual([1])
  })

  it('leaves a variable and an off-palette colour alone', () => {
    expect(tokenHexShadowLines('<span className="shadow-[2px_2px_0_var(--bd-ink)]" style={{ boxShadow: \'0 0 12px #FF3FA4\' }}>', tokenHex)).toEqual([])
  })
})

describe('dead tokens', () => {
  it.each(['--color-primary:', '--color-secondary:', '--primary-500:', '--secondary-500:', '--success-500:', '--error-500:'])('globals.css no longer declares %s, which nothing reads', (token) => {
    expect(globalsCss).not.toContain(token)
  })

  it('draws a ring with no colour class in the focus colour, through @theme inline so a lobby theme reaches it', () => {
    const inline = /@theme inline \{([^]*?)\n\}/.exec(globalsCss)![1]
    expect(inline).toContain('--default-ring-color: var(--bd-lav-deep);')
    expect(globalsCss.match(/--default-ring-color:/g)).toHaveLength(1)
  })

  it('the game catalog carries no gradient class list that nothing renders', () => {
    const catalog = readFileSync(path.join(__dirname, '..', '..', 'lib', 'game-catalog.ts'), 'utf8')
    expect(catalog).not.toMatch(/\bgradient:/)
  })
})

describe('preflight defaults and sources', () => {
  const base = /@layer base \{([^]*?)\n\}/.exec(globalsCss)![1]

  it('a border with no colour class draws in --bd-line, so it flips with the theme', () => {
    expect(base).toMatch(/::file-selector-button \{\s*border-color: var\(--bd-line\);/)
  })

  it('placeholders in inputs and textareas use --bd-ink-muted, which holds 4.5:1', () => {
    expect(base).toMatch(/textarea::placeholder \{\s*color: var\(--bd-ink-muted\);/)
  })

  it('leaves the game catalog out of the scan, whose colour strings nothing renders', () => {
    expect(globalsCss).toContain("@source not '../lib/game-catalog.ts';")
  })

  it.each(['lib', 'hooks', 'contexts'])('Tailwind scans %s/, where class maps live too', (dir) => {
    expect(globalsCss).toContain(`@source '../${dir}/**/*.{ts,tsx}';`)
  })
})

describe('transition-all', () => {
  it.each([
    ['a class', '<button className="rounded-xl transition-all duration-200">'],
    ['a variant', '<div className="md:transition-all">'],
    ['an @apply', '  @apply px-4 py-2 transition-all duration-200;'],
  ])('flags %s', (_label, line) => {
    expect(transitionAllLines(line)).toEqual([1])
  })

  it('leaves transition, a property list and a longer name alone', () => {
    expect(transitionAllLines('<div className="transition transition-[width] transition-colors transition-all-x">')).toEqual([])
  })

  it('globals.css applies no transition-all', () => {
    expect(transitionAllLines(globalsCss)).toEqual([])
  })
})

describe('the range slider', () => {
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]"()-]/g, '\\$&')} \\{([^}]*)\\}`).exec(globalsCss)![1]

  it('drops the browser track, so the player-count slider is not the one blue control on the site', () => {
    expect(rule('input[type="range"].slider-thumb')).toMatch(/appearance: none;[^]*accent-color: var\(--bd-ink\);/)
  })

  it.each(['::-webkit-slider-thumb', '::-moz-range-thumb'])('draws the %s on the card with an ink edge, visible on the pale track', (pseudo) => {
    expect(rule(`input[type="range"].slider-thumb${pseudo}`)).toMatch(/background: var\(--bd-card\);[^]*border: 2px solid var\(--bd-ink\);/)
  })
})

function scan(rule: (src: string) => number[]): string[] {
  const root = path.join(__dirname, '..', '..')
  const found: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(name)) for (const line of rule(readFileSync(full, 'utf8'))) found.push(`${path.relative(root, full)}:${line}`)
    }
  }
  for (const dir of ['app', 'components']) if (existsSync(path.join(root, dir))) walk(path.join(root, dir))
  return found
}

describe('the app and components', () => {
  it('draw accent-coloured text only with the --bd-*-text tokens', () => {
    expect(scan(accentTextLines)).toEqual([])
  })

  it('draw every focus ring in lav-deep', () => {
    expect(scan(focusColourLines)).toEqual([])
  })

  it('draw shadows in a token colour through its variable', () => {
    const tokenHex = tokenHexValues(globalsCss)
    expect(scan((src) => tokenHexShadowLines(src, tokenHex)).filter((at) => !at.startsWith('app/root-document.tsx'))).toEqual([])
  })

  it('name what they transition instead of transition-all, which reaches layout properties', () => {
    expect(scan(transitionAllLines)).toEqual([])
  })

  it('draw status and gold colours with the tokens, not Tailwind palette hex', () => {
    const PALETTE_HEX = /#(?:FCA5A5|F87171|EF4444|DC2626|B91C1C|FCD34D|FBBF24|F59E0B|D97706|B45309|FACC15|EAB308|86EFAC|4ADE80|22C55E|16A34A|15803D|34D399|10B981|059669)\b/i
    expect(scan((src) => src.split('\n').flatMap((line, i) => (PALETTE_HEX.test(line) && !/accent-text-allow|--bd-premium/.test(line) ? [i + 1] : [])))).toEqual([])
  })

  it('spell a colour with a utility as that utility', () => {
    const utilities = colourUtilities(globalsCss)
    expect(scan((src) => varShorthandLines(src, utilities))).toEqual([])
  })
})
