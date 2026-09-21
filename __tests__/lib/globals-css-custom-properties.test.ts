import fs from 'fs'
import path from 'path'

/**
 * #1040: `.liars-card--danger` was written against `--bd-danger-bg`,
 * `--bd-danger-border` and `--bd-danger-text`. None of the three exists
 * anywhere in the project. A `var()` on an undefined property with no fallback
 * is invalid at computed-value time, so the rule did not fall back to anything
 * sensible – the eliminated-player alert rendered with no background and a
 * currentColor border, and nothing anywhere said so. CSS has no undefined-name
 * error: the browser drops the declaration and carries on.
 *
 * So: every custom property that `app/globals.css` reads without a fallback has
 * to be written somewhere. Either the stylesheet declares it, or a component
 * sets it as an inline style (`--grid-cols`, `--hand-accent` and friends are
 * per-instance values that can only come from TSX).
 */

const ROOT = path.join(__dirname, '..', '..')
const CSS_PATH = path.join(ROOT, 'app', 'globals.css')

/** Directories whose TSX may set a custom property through a style prop. */
const STYLE_SOURCE_DIRS = ['app', 'components']

function readTree(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) readTree(full, out)
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('app/globals.css custom properties', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8')

  /** `var(--x)` with no comma, i.e. no fallback to fall back to. */
  function usedWithoutFallback(source: string): string[] {
    return [...source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)].map((m) => m[1])
  }

  /** `--x:` in a declaration position. */
  function declaredInCss(source: string): string[] {
    return [...source.matchAll(/(?:^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1])
  }

  /** `'--x':` or `"--x":` – a custom property set from a JSX style object. */
  function setFromComponents(): Set<string> {
    const found = new Set<string>()
    for (const dir of STYLE_SOURCE_DIRS) {
      for (const file of readTree(path.join(ROOT, dir))) {
        const text = fs.readFileSync(file, 'utf8')
        for (const m of text.matchAll(/['"](--[A-Za-z0-9_-]+)['"]\s*:/g)) found.add(m[1])
      }
    }
    return found
  }

  it('reads no custom property that nothing ever sets', () => {
    const declared = new Set(declaredInCss(css))
    const inline = setFromComponents()

    const undefinedProperties = [...new Set(usedWithoutFallback(css))]
      .filter((name) => !declared.has(name) && !inline.has(name))
      .sort()

    expect(undefinedProperties).toEqual([])
  })

  it("styles Liar's Party's eliminated alert from properties that resolve", () => {
    // The specific rule the gate above was written for, asserted directly so a
    // rename of the whole block cannot quietly take the coverage with it.
    const rule = css.match(/\.liars-card--danger\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()

    const declared = new Set(declaredInCss(css))
    const inline = setFromComponents()
    const referenced = usedWithoutFallback(rule![1])

    expect(referenced.length).toBeGreaterThan(0)
    for (const name of referenced) {
      expect(declared.has(name) || inline.has(name)).toBe(true)
    }
    // A background is the half that vanished: `background: var(--undefined)`
    // computes to transparent and looks like a plain card.
    expect(rule![1]).toMatch(/background\s*:/)
  })
})
