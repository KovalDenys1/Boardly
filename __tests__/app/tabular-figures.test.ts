import { readFileSync } from 'fs'
import path from 'path'

const read = (file: string) => readFileSync(path.join(__dirname, '..', '..', file), 'utf8')
const css = read('app/globals.css')

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const match = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`no ${selector} rule in globals.css`)
  return match[1]
}

describe('numbers that change in place keep their width', () => {
  it.each(['.game-scoreboard-header', '.game-player-card', '.score-pop'])('%s sets tabular figures', (selector) => {
    expect(rule(selector)).toContain('font-variant-numeric: tabular-nums;')
  })

  it('the leaderboard rows set tabular figures, so the rank, games and win-rate columns line up', () => {
    expect(read('app/(site)/leaderboard/LeaderboardClient.tsx')).toMatch(/const rowClass = `grid tabular-nums /)
  })
})
