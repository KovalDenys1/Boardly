import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { MOTION_MS } from '@/lib/motion-durations'
import { CAPTURE_FADE_MS } from '@/lib/games/checkers-motion'
import { RPS_REVEAL_MS, RPS_SHAKE_MS } from '@/lib/rps-motion'
import { MATCH_CUE_MS, MEMORY_FLIP_MS } from '@/lib/memory-motion'
import { MATCH_POP_DELAY_MS } from '@/app/(site)/lobby/[code]/hooks/useMemorySounds'
import { ROLE_FLIP_DELAY_MS } from '@/app/(site)/lobby/[code]/hooks/useSpySounds'

// One motion vocabulary (#1569): curves and durations come from the --bd-ease-* and --bd-dur-* tokens.

const ROOT = path.join(__dirname, '..', '..')
const css = readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8')
const cssCode = css.replace(/\/\*[^]*?\*\//g, '')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}
const CODE = ['app', 'components', 'lib', 'hooks', 'contexts'].flatMap((dir) => sources(path.join(ROOT, dir)))

/** `file:line` for every line of the app's TS/TSX that matches. */
function codeLines(pattern: RegExp): string[] {
  return CODE.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => (pattern.test(line) ? [`${path.relative(ROOT, file)}:${i + 1}`] : [])),
  )
}

/** Innermost `selector { body }` rules, @keyframes steps and @media children included. */
const RULES = [...cssCode.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))

function declarations(property: RegExp): Array<{ selector: string; value: string }> {
  return RULES.flatMap(({ selector, body }) =>
    [...body.matchAll(/(?:^|;|\n)\s*([a-z-]+)\s*:\s*([^;]+);/g)]
      .filter((m) => property.test(m[1]))
      .map((m) => ({ selector, value: m[2].replace(/\s*!important\s*$/, '').trim() })),
  )
}

/** Split a shorthand value on its top-level commas. */
function parts(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    } else current += ch
  }
  return [...out, current.trim()].filter(Boolean)
}

const TIME = /(?<![\w.-])\d*\.?\d+m?s\b/
const KEYWORD_CURVE = /(?<![\w-])(?:ease|ease-in|ease-out|ease-in-out)(?![\w-])/
const TOKEN_CURVE = /var\(--bd-ease-[a-z-]+\)|(?<![\w-])linear(?![\w-])|steps\(/
const TOKEN_DURATION = /^(?:var\(--bd-dur(?:-[a-z]+)?\)|calc\([^)]*var\(--bd-dur(?:-[a-z]+)?\)[^)]*\))/

describe('motion curves', () => {
  it('spell no cubic-bezier( outside the token block in globals.css', () => {
    const outside = css.split('\n').flatMap((line, i) => (line.includes('cubic-bezier(') && !/^\s*--bd-ease-[a-z-]+:\s*cubic-bezier\(/.test(line) ? [i + 1] : []))
    expect(outside).toEqual([])
  })

  it('spell no cubic-bezier( in the app code, a Tailwind ease-[…] class included', () => {
    expect(codeLines(/cubic-bezier\(/)).toEqual([])
  })

  it('name every curve in globals.css with a token, or linear for time itself', () => {
    const shorthands = declarations(/^(?:animation|transition)$/).flatMap(({ selector, value }) =>
      parts(value)
        .filter((part) => part !== 'none' && !TOKEN_CURVE.test(part))
        .map((part) => `${selector}: ${part}`),
    )
    const longhands = declarations(/^(?:animation|transition)-timing-function$/)
      .filter(({ value }) => parts(value).some((part) => !TOKEN_CURVE.test(part)))
      .map(({ selector, value }) => `${selector}: ${value}`)
    expect([...shorthands, ...longhands]).toEqual([])
  })

  it('leave no keyword curve in an inline transition or animation style', () => {
    expect(codeLines(/(?:transition|animation)['"]?\s*:\s*['"`][^'"`]*(?<![\w-])ease(?:-in|-out|-in-out)?(?![\w-])/)).toEqual([])
  })

  it('point the Tailwind defaults at the tokens, so a bare transition class follows them', () => {
    const inline = /@theme inline \{([^]*?)\n\}/.exec(css)![1]
    for (const line of [
      '--default-transition-duration: var(--bd-dur-fast);',
      '--default-transition-timing-function: var(--bd-ease-out);',
      '--ease-out: var(--bd-ease-out);',
      '--ease-in: var(--bd-ease-in);',
      '--ease-in-out: var(--bd-ease-in-out);',
      '--transition-duration-bd-fast: var(--bd-dur-fast);',
      '--transition-duration-bd: var(--bd-dur);',
      '--transition-duration-bd-slow: var(--bd-dur-slow);',
    ]) {
      expect(inline).toContain(line)
    }
  })
})

describe('motion durations', () => {
  // A loop's period and a linear clock or progress bar keep their real time; everything else is a token.
  const exempt = (part: string) => /(?<![\w-])(?:infinite|linear)(?![\w-])/.test(part)

  it('come from --bd-dur-* in every animation and transition in globals.css', () => {
    const raw = declarations(/^(?:animation|transition)$/).flatMap(({ selector, value }) =>
      parts(value)
        .filter((part) => part !== 'none' && !exempt(part))
        .filter((part) => {
          const duration = part.split(/\s+(?![^(]*\))/).find((word) => TIME.test(word) || word.includes('var(--bd-dur') || word.startsWith('calc('))
          return !duration || !TOKEN_DURATION.test(duration)
        })
        .map((part) => `${selector}: ${part}`),
    )
    const longhands = declarations(/^(?:animation|transition)-duration$/)
      .filter(({ value }) => !TOKEN_DURATION.test(value) && !/^0\.01ms$|^0s$/.test(value))
      .map(({ selector, value }) => `${selector}: ${value}`)
    expect([...raw, ...longhands]).toEqual([])
  })

  it('come from the duration tokens in Tailwind classes, @apply included', () => {
    const numeric = /(?<![\w-])(?:[a-z0-9-]+:)*duration-\d+(?![\w-])/
    const applied = css.split('\n').flatMap((line, i) => (/^\s*@apply\b/.test(line) && numeric.test(line) ? [`app/globals.css:${i + 1}`] : []))
    expect([...codeLines(numeric), ...applied]).toEqual([])
  })

  it('come from the duration tokens in inline transition and animation styles', () => {
    const literal = /(?:transition|animation)['"]?\s*:\s*['"`]([^'"`]*)['"`]/g
    const raw = CODE.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          [...line.matchAll(literal)].some((m) => parts(m[1]).some((part) => !exempt(part) && TIME.test(part.replace(/\$\{[^}]*\}m?s/g, ''))))
            ? [`${path.relative(ROOT, file)}:${i + 1}`]
            : [],
        ),
    )
    expect(raw).toEqual([])
  })

  it('come from the tokens in Tailwind arbitrary animate-[…], duration-[…], delay-[…] and ease-[…] values', () => {
    const arbitrary = /(?<![\w-])(animate|duration|delay|ease)-\[([^\]]+)\]/g
    const raw = CODE.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          [...line.matchAll(arbitrary)]
            .filter(([, kind, value]) => {
              const words = value.split('_')
              if (kind === 'ease') return !TOKEN_CURVE.test(value)
              if (kind !== 'animate') return !TOKEN_DURATION.test(value)
              return words.some((word) => TIME.test(word) || KEYWORD_CURVE.test(word) || word.startsWith('cubic-bezier('))
            })
            .map((m) => `${path.relative(ROOT, file)}:${i + 1} ${m[0]}`),
        ),
    )
    expect(raw).toEqual([])
  })
})

/** The global reduced-motion block: the rule for every element, then the fades that get their time back. */
const block = /@media \(prefers-reduced-motion: reduce\) \{\n  \*,\n  \*::before,\n  \*::after \{([^}]*)\}([^]*?)\n\}/.exec(cssCode)

describe('reduced motion', () => {
  const rule = block?.[1] ?? ''

  it('stops movement: keyframes collapse and transitions drop transform', () => {
    expect(rule).toMatch(/animation-duration: 0\.01ms !important;/)
    const property = /transition-property:\s*([^;]+);/.exec(rule)?.[1] ?? ''
    expect(property).toContain('opacity')
    expect(property).not.toMatch(/transform|translate|scale|rotate|width|height|top|left|margin|all/)
  })

  it('leaves opacity transitions their own duration', () => {
    expect(rule).not.toMatch(/transition-duration|transition:/)
  })

  // A keyframe animation that changes only opacity is a fade, not movement, so it keeps a duration.
  const fades = new Set(
    [...cssCode.matchAll(/@keyframes ([\w-]+) \{([^]*?)\n\}/g)]
      .filter((m) => [...m[2].matchAll(/([a-z-]+)\s*:/g)].every((p) => p[1] === 'opacity' || p[1] === 'animation-timing-function'))
      .map((m) => m[1]),
  )
  const exemptions = [...(block?.[2] ?? '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(',').map((sel) => sel.trim()).filter(Boolean),
    declarations: [...m[2].matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
  }))

  // Naming the keyframes is what keeps a moving animation on the same element from borrowing the time.
  it('gives time back only through a rule that names one opacity-only keyframe, without a delay', () => {
    expect(fades.size).toBeGreaterThan(3)
    expect(exemptions.length).toBeGreaterThan(3)
    const wrong = exemptions
      .filter(({ declarations }) => {
        if (declarations.length !== 1 || declarations[0][0] !== 'animation') return true
        const value = declarations[0][1]
        if (!/!important$/.test(value) || parts(value).length !== 1) return true
        const words = value.replace(/\s*!important$/, '').split(/\s+(?![^(]*\))/)
        return !fades.has(words[0]) || words.filter((word) => TOKEN_DURATION.test(word) || TIME.test(word)).length !== 1
      })
      .map(({ selectors, declarations }) => `${selectors.join(', ')} { ${declarations.map((d) => d.join(': ')).join('; ')} }`)
    expect(wrong).toEqual([])
  })

  it('lets every one-shot fade keyframe run', () => {
    const users = declarations(/^(?:animation|animation-name)$/)
      .filter(({ value }) => !/infinite/.test(value) && parts(value).some((part) => fades.has(part.split(/\s+/)[0])))
      .map(({ selector }) => selector)
      .filter((selector) => !selector.startsWith('@'))
    expect(users.length).toBeGreaterThan(3)
    const listed = new Set(exemptions.flatMap(({ selectors }) => selectors))
    expect(users.flatMap((selector) => selector.split(',').map((sel) => sel.trim())).filter((sel) => !listed.has(sel))).toEqual([])
  })

  it('keeps fades out of arbitrary animate-[…] classes, which the reduced-motion rules cannot name', () => {
    const hidden = codeLines(new RegExp(`animate-\\[(?:${[...fades].join('|')})_`))
    expect(hidden).toEqual([])
  })

  it('does not use motion-reduce:transition-none, which the transition-property rule overrides', () => {
    expect(codeLines(/motion-reduce:transition-none/)).toEqual([])
  })
})

describe('JavaScript waits', () => {
  const tokens = Object.fromEntries(
    ['--bd-dur-fast', '--bd-dur', '--bd-dur-slow'].map((name) => [name, Number(new RegExp(`${name}:\\s*(\\d+)ms;`).exec(css)?.[1])]),
  )

  /** Milliseconds of a duration token, a calc() of them, or a literal time. */
  function ms(expr: string): number {
    const arithmetic = expr
      .replace(/var\((--bd-dur(?:-fast|-slow)?)\)/g, (_, name: string) => String(tokens[name]))
      .replace(/^calc\((.*)\)$/, '$1')
      .replace(/(\d*\.?\d+)(ms|s)\b/g, (_, value: string, unit: string) => String(unit === 's' ? Number(value) * 1000 : Number(value)))
    if (!/^[\d.\s*+]+$/.test(arithmetic)) throw new Error(`not a duration: ${expr}`)
    return arithmetic.split('+').reduce((sum, term) => sum + term.split('*').reduce((product, factor) => product * Number(factor), 1), 0)
  }

  /** Duration and delay of the first animation or transition the selector declares outside reduced motion. */
  function timing(selector: string, property: 'animation' | 'transition' = 'animation') {
    const rule = [...cssCode.replace(block?.[0] ?? '', '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => m[1].split(',').map((sel) => sel.trim()).includes(selector))
      .flatMap((m) => [...m[2].matchAll(new RegExp(`(?:^|;|\\n)\\s*${property}\\s*:\\s*([^;]+);`, 'g'))].map((d) => ({ value: d[1].trim() })))[0]
    if (!rule) throw new Error(`${selector} declares no ${property}`)
    const times = parts(rule.value)[0].split(/\s+(?![^(]*\))/).filter((word) => TIME.test(word) || word.startsWith('var(--bd-dur') || word.startsWith('calc('))
    return { duration: ms(times[0]), delay: times[1] ? ms(times[1]) : 0 }
  }

  it('use the --bd-dur-* tokens in milliseconds', () => {
    expect(MOTION_MS).toEqual({ fast: tokens['--bd-dur-fast'], base: tokens['--bd-dur'], slow: tokens['--bd-dur-slow'] })
  })

  it('remove a captured checkers piece when its fade ends', () => {
    expect(CAPTURE_FADE_MS).toBe(timing('.ck-piece--captured').duration)
    expect(CAPTURE_FADE_MS).toBe(timing('.ck-piece--jumped').duration)
  })

  it('swap the RPS icon when the shake ends and call the result when the flip lands', () => {
    expect(RPS_SHAKE_MS).toBe(timing('.rps-hand--reveal.rps-hand--shaking .rps-hand__emoji').duration)
    expect(RPS_REVEAL_MS).toBe(RPS_SHAKE_MS + timing('.rps-hand--reveal .rps-hand__emoji').duration)
  })

  it('time the Memory match pop and cue to the flip they wait for', () => {
    expect(MEMORY_FLIP_MS).toBe(timing('.memory-tile-inner', 'transition').duration)
    expect(MATCH_POP_DELAY_MS).toBe(timing('.memory-tile-match-cue').delay)
    expect(MATCH_POP_DELAY_MS).toBe(MEMORY_FLIP_MS)
    for (const cue of ['.memory-tile-match-cue', '.memory-tile-match-cue::after']) {
      const { duration, delay } = timing(cue)
      expect([cue, delay + duration]).toEqual([cue, MATCH_CUE_MS])
    }
  })

  it('play the spy role-card sound when its flip starts', () => {
    expect(ROLE_FLIP_DELAY_MS).toBe(timing('.spy-role-flip__inner--play').delay)
  })

  it('end the profile preview phases with their fades', () => {
    const page = readFileSync(path.join(ROOT, 'app', '(site)', 'profile', 'page.tsx'), 'utf8')
    expect(page).toContain('const PROFILE_PREVIEW_EXIT_MS = MOTION_MS.fast')
    expect(page).toContain('const PROFILE_PREVIEW_ENTER_MS = MOTION_MS.slow')
    expect(timing('.animate-profile-surface-exit').duration).toBe(MOTION_MS.fast)
    expect(timing('.animate-profile-surface-enter').duration).toBe(MOTION_MS.slow)
    expect(timing('.animate-profile-preview-enter').duration).toBe(MOTION_MS.slow)
  })
})
