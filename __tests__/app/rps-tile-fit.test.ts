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

  it('drop the hint line where the tiles are too small for it', () => {
    const widths = [...css.matchAll(/@container \(max-width: (\d+)px\)\s*\{((?:[^{}]*\{[^}]*\})*)[^{}]*\}/g)]
      .filter((m) => /\.rps-tile__beats\s*\{\s*display:\s*none/.test(m[2]))
      .map((m) => Number(m[1]))
    expect(widths.length).toBeGreaterThan(0)
    expect((Math.max(...widths) - 72) / 3).toBeGreaterThanOrEqual(87)
  })

  // The longest hint ("schlägt Schere", "beats Scissors") needs 71px inside a tile's 8px padding and 2px border.
  it('keep the hint wherever it fits: a 390 px phone (350 px card) shows it, a 375 px phone (335 px card) does not', () => {
    const widths = [...css.matchAll(/@container \(max-width: (\d+)px\)\s*\{((?:[^{}]*\{[^}]*\})*)[^{}]*\}/g)]
      .filter((m) => /\.rps-tile__beats\s*\{\s*display:\s*none/.test(m[2]))
      .map((m) => Number(m[1]))
    expect(Math.max(...widths)).toBeGreaterThanOrEqual(335)
    expect(Math.max(...widths)).toBeLessThan(350)
    expect((Math.max(...widths) + 1 - 72) / 3 - 20).toBeGreaterThanOrEqual(71)
  })
})
