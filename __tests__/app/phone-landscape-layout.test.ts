import { readFileSync } from 'fs'
import path from 'path'
import { PHONE_LANDSCAPE_MEDIA_QUERY } from '@/lib/responsive-tokens'

/**
 * The phone-landscape contract (#901, #902).
 *
 * These are stylesheet assertions rather than rendered ones because the rules
 * only apply inside a media query, and jsdom resolves no media queries at all.
 * What they guard is the thing that made #902 survive two fixes: the landscape
 * rules used to exist in three copies (.ttt-landscape-*, .memory-landscape-*,
 * .yahtzee-landscape-*), so the chat panel's missing floor had to be found in
 * each of them.
 */
const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')

/** The body of every `@media <condition> { … }` block, brace-matched. */
function mediaBlocks(condition: string): string[] {
  const blocks: string[] = []
  const opener = `@media ${condition} {`
  let from = 0

  while (true) {
    const start = css.indexOf(opener, from)
    if (start === -1) return blocks

    let depth = 0
    let i = start + opener.length - 1
    for (; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1
      else if (css[i] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    blocks.push(css.slice(start + opener.length, i))
    from = i + 1
  }
}

describe('phone-landscape layout family', () => {
  const landscape = mediaBlocks(PHONE_LANDSCAPE_MEDIA_QUERY).join('\n')

  it('has rules under the shared orientation condition, not a new width', () => {
    expect(PHONE_LANDSCAPE_MEDIA_QUERY).toBe('(max-width: 1023px) and (orientation: landscape)')
    expect(landscape.length).toBeGreaterThan(0)
    expect(landscape).toContain('.game-landscape-side')
  })

  it('is one family — no per-game copy of the layout tree is left', () => {
    for (const duplicated of [
      '.ttt-landscape-layout',
      '.ttt-landscape-board',
      '.ttt-landscape-side',
      '.memory-landscape-layout',
      '.memory-landscape-side',
      '.yahtzee-landscape-board',
    ]) {
      expect(css).not.toContain(duplicated)
    }
  })

  it('gives the chat panel a floor in the landscape side column', () => {
    // #902: chat was the column's only flexible member, so it absorbed the
    // whole height deficit — 60px in Connect Four, which `overflow: hidden`
    // then cut down to the title strip.
    const rule = landscape.match(/\.game-landscape-side > \.game-chat-panel\s*\{[^}]*\}/)
    expect(rule).not.toBeNull()
    const floor = rule![0].match(/min-height:\s*(\d+)px/)
    expect(floor).not.toBeNull()
    expect(Number(floor![1])).toBeGreaterThanOrEqual(120)
  })

  it('scrolls the side column rather than clipping it', () => {
    const rule = landscape.match(/\.game-landscape-side\s*\{[^}]*\}/)
    expect(rule).not.toBeNull()
    expect(rule![0]).toContain('overflow-y: auto')
  })

  it('swaps in the compact scoreboard centre and shrinks the player card', () => {
    expect(landscape).toContain('.game-scoreboard-header--has-compact .game-scoreboard-center--compact')
    expect(landscape).toContain('.game-landscape-side .game-player-avatar')
  })

  it('gives Spy and Alias a branch of their own', () => {
    // Both had only a width-only `@media (max-width: 1023px)` rule, which is
    // what served an 844px-wide phone the tall stacked layout (#901).
    expect(landscape).toContain('.spy-role-card')
    expect(landscape).toContain('.alias-team-card')
  })
})

/**
 * Liar's Party puts its header card inside `.ttt-top-row`, beside the compact
 * room card that carries Leave, and that row is a ROW flex container (#1041).
 * So a landscape rule that sets `flex` on the header card sets its WIDTH, not
 * its height, and overrides the shared `.ttt-top-row > :first-child`. The
 * branch shipped `flex: 0 0 auto` there: measured live at 844x390 the header
 * sized to its content, leaving 37 to 78px of dead row beside Leave in
 * claim/challenge/reveal, and at game over pushing Leave 18px past the row's
 * right edge with the side column at scrollWidth 318 against clientWidth 300 –
 * while `document.scrollWidth` stayed 844, which is why the page-level
 * horizontal-scroll sweep called it clean.
 *
 * Height is not this card's problem: `.ttt-top-row` is `flex-shrink: 0`, so
 * the column cannot squeeze it. Sketch & Guess's `flex: 0 0 auto` is a
 * different case and stays – its header card is a direct child of the column,
 * where the same declaration means height.
 */
describe("the landscape header card of a game whose header shares a row", () => {
  const landscape = mediaBlocks(PHONE_LANDSCAPE_MEDIA_QUERY).join('\n')
  const page = readFileSync(
    path.join(process.cwd(), 'app', 'lobby', '[code]', 'liars-party-page.tsx'),
    'utf8',
  )

  /**
   * Every `selector { … }` rule in a flat block whose selector mentions
   * `needle`. Comments are stripped first: the comments in this stylesheet
   * quote selectors, braces and all, and a naive parse reads one as a rule.
   */
  function rulesMentioning(block: string, needle: string): { selector: string; body: string }[] {
    const found: { selector: string; body: string }[] = []
    const rule = /([^{}]+)\{([^{}]*)\}/g
    let match: RegExpExecArray | null
    const uncommented = block.replace(/\/\*[\s\S]*?\*\//g, '')
    while ((match = rule.exec(uncommented)) !== null) {
      const selector = match[1].trim()
      if (selector.includes(needle)) found.push({ selector, body: match[2] })
    }
    return found
  }

  const landscapeTree = page.slice(
    page.indexOf('<div className="game-landscape-layout">'),
    page.indexOf('{/* ── MOBILE'),
  )

  it("renders the header and Leave in one `.ttt-top-row` in the landscape tree", () => {
    // If this ever stops being true the rule below stops applying, and whoever
    // changes it should read the comment above before relaxing it.
    expect(landscapeTree).toContain('<div className="ttt-top-row">{headerSection}{roomSectionCompact}</div>')
    expect(page).toContain('<div className="ttt-card liars-header-card">')
  })

  it('leaves the header card\'s width to the shared row rule', () => {
    const rules = rulesMentioning(landscape, '.liars-header-card')
    expect(rules.length).toBeGreaterThan(0)

    const sizing = rules
      .filter(({ body }) => /(^|;)\s*flex(-grow|-basis|-shrink)?\s*:/.test(body))
      .map(({ selector, body }) => `${selector} {${body.trim()}}`)
    expect(sizing).toEqual([])
  })

  it('keeps the shared row rule that makes the header fill the row', () => {
    const shared = css.match(/\.ttt-top-row > :first-child\s*\{([^}]*)\}/)
    expect(shared).not.toBeNull()
    expect(shared![1]).toContain('flex: 1 1 auto')
    expect(css).toMatch(/\.ttt-top-row\s*\{[^}]*flex-shrink:\s*0/)
  })
})

describe('scoreboard and player-card geometry', () => {
  it('lives in the stylesheet, where a breakpoint can reach it', () => {
    // An inline style beats every stylesheet rule, so while these numbers sat
    // in the components' style props no media query could tighten them (#901).
    for (const selector of [
      '.game-scoreboard-header {',
      '.game-scoreboard-center {',
      '.game-player-card {',
      '.game-player-avatar {',
      '.game-player-turn {',
    ]) {
      expect(css).toContain(selector)
    }
  })
})
