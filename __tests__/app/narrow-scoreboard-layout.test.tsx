import { readFileSync } from 'fs'
import path from 'path'
import { render } from '@testing-library/react'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

/**
 * The narrow-scoreboard contract (#1180).
 *
 * On a 390px phone the two player cells of a kit header are ~96px, and the
 * row form of GamePlayerCard needs ~76px before the name starts: names came
 * out as "Kov…" and the turn line ran over the score. The card now stacks on
 * a container query over its own cell. jsdom resolves no container queries,
 * so these are stylesheet assertions plus one render check: the alignment the
 * stacked form overrides must not come back as inline style, which would
 * outrank the stylesheet (the #901 trap).
 */
const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')

/** The body of the first `@container <condition> { … }` block, brace-matched. */
function containerBlock(condition: string): string {
  const opener = `@container ${condition} {`
  const start = css.indexOf(opener)
  if (start === -1) return ''
  let depth = 0
  let i = start + opener.length - 1
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return css.slice(start + opener.length, i)
}

describe('narrow scoreboard header (#1180)', () => {
  it('makes the header and both player cells named size containers', () => {
    expect(css).toMatch(/\.game-scoreboard-header \{[^}]*container: game-scoreboard \/ inline-size;/)
    expect(css).toMatch(/\.game-scoreboard-cell--left \{[^}]*container: game-scoreboard-cell \/ inline-size;/)
    expect(css).toMatch(/\.game-scoreboard-cell--right \{[^}]*container: game-scoreboard-cell \/ inline-size;/)
  })

  it('stacks a narrow card and drops the lines that collided with the score', () => {
    const block = containerBlock('game-scoreboard-cell (max-width: 149px)')
    expect(block).toMatch(/> \.game-player-card \{[^}]*flex-direction: column;/)
    expect(block).toMatch(/\.game-player-subline \{ display: none; \}/)
    // Visually hidden, not removed: the turn text stays for screen readers.
    expect(block).toMatch(/\.game-player-turn \{[^}]*clip: rect\(0 0 0 0\);/)
  })

  it('switches to the compact centre on a narrow header', () => {
    const block = containerBlock('game-scoreboard (max-width: 479px)')
    expect(block).toMatch(/--has-compact \.game-scoreboard-center--compact \{ display: block; \}/)
  })

  it('keeps the conversation games out: their phone right cell is an auto track', () => {
    expect(css).toMatch(
      /:is\(\.sketch-header-card, \.spy-header-card, \.alias-header-card, \.liars-header-card\) \.game-scoreboard-cell \{ container-type: normal; \}/
    )
  })

  it('carries no inline alignment the container query would lose to', () => {
    const { container } = render(
      <GamePlayerCard name="Gravity Grandmaster" isActive isMe={false} isWinner={false} side="right" accentColor="#fc0" subline="0W" />
    )
    const styled = [...container.querySelectorAll<HTMLElement>('[style]')]
    for (const el of styled) {
      expect(el.style.textAlign).toBe('')
      expect(el.style.justifyContent).toBe('')
    }
    expect(container.querySelector('.game-player-name')?.textContent).toBe('Gravity Grandmaster')
  })
})
