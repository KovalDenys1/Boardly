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
