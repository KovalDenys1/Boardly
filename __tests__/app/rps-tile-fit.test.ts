import fs from 'fs'
import path from 'path'

// A tile is a square of (card width - 72px) / 3, at least 76px. Emoji, label and a wrapped
// "beats Scissors" line need more than that at 320 px, so the second line was cut (V37).
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8')

describe('RPS choice tiles', () => {
  it('never wrap the hint line', () => {
    const rule = /\.rps-tile__beats\s*\{([^}]*)\}/.exec(css)
    expect(rule?.[1]).toMatch(/white-space:\s*nowrap/)
  })

  it('drop the hint line in any card whose tiles fall under 90px', () => {
    const widths = [...css.matchAll(/@container \(max-width: (\d+)px\)\s*\{((?:[^{}]*\{[^}]*\})*)[^{}]*\}/g)]
      .filter((m) => /\.rps-tile__beats\s*\{\s*display:\s*none/.test(m[2]))
      .map((m) => Number(m[1]))
    expect(widths.length).toBeGreaterThan(0)
    expect((Math.max(...widths) - 72) / 3).toBeGreaterThanOrEqual(90)
  })
})
