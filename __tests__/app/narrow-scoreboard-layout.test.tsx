import { readFileSync } from 'fs'
import path from 'path'
import postcss, { type AtRule, type Declaration } from 'postcss'
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
 * outrank the stylesheet (the #901 trap). The stylesheet is parsed with
 * postcss, so the assertions are about selectors and values, not formatting.
 */
const root = postcss.parse(readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8'))

const squash = (value: string) => value.replace(/\s+/g, ' ').trim()

/** Declarations of every rule whose selector list contains `selector`, optionally only inside one at-rule. */
function declsFor(selector: string, atRule?: { name: string; params: string }): Record<string, string>[] {
  const found: Record<string, string>[] = []
  root.walkRules((rule) => {
    if (!rule.selectors.map(squash).includes(squash(selector))) return
    const parent = rule.parent
    if (atRule) {
      if (parent?.type !== 'atrule') return
      const at = parent as AtRule
      if (at.name !== atRule.name || squash(at.params) !== squash(atRule.params)) return
    }
    const decls: Record<string, string> = {}
    rule.each((node) => {
      if (node.type === 'decl') decls[node.prop] = squash((node as Declaration).value)
    })
    found.push(decls)
  })
  return found
}

/** The value `prop` gets from any matching rule, or undefined. */
function valueOf(selector: string, prop: string, atRule?: { name: string; params: string }): string | undefined {
  return declsFor(selector, atRule).find((decls) => prop in decls)?.[prop]
}

const STACKED = { name: 'container', params: 'game-scoreboard-cell (max-width: 149px)' }
const NARROW_HEADER = { name: 'container', params: 'game-scoreboard (max-width: 479px)' }
const LANDSCAPE = { name: 'media', params: '(max-width: 1023px) and (orientation: landscape)' }
const CELL = ':is(.game-scoreboard-cell--left, .game-scoreboard-right-card) > .game-player-card'

describe('narrow scoreboard header (#1180)', () => {
  it('makes the header and both player cells named size containers', () => {
    expect(valueOf('.game-scoreboard-header', 'container')).toBe('game-scoreboard / inline-size')
    expect(valueOf('.game-scoreboard-cell--left', 'container')).toBe('game-scoreboard-cell / inline-size')
    expect(valueOf('.game-scoreboard-cell--right', 'container')).toBe('game-scoreboard-cell / inline-size')
  })

  it('stacks a narrow card and drops the lines that collided with the score', () => {
    expect(valueOf(CELL, 'flex-direction', STACKED)).toBe('column')
    expect(valueOf(`${CELL} .game-player-subline`, 'display', STACKED)).toBe('none')
    // Visually hidden, not removed: the turn text stays for screen readers.
    expect(valueOf(`${CELL} .game-player-turn`, 'clip', STACKED)).toBe('rect(0 0 0 0)')
    expect(valueOf(`${CELL} .game-player-turn`, 'display', STACKED)).toBeUndefined()
  })

  it('shrinks the corner badge with the stacked avatar so the initial stays readable', () => {
    const badge = `${CELL} .game-player-avatar-wrap > :not(.game-player-avatar)`
    const transform = valueOf(badge, 'transform', STACKED) ?? ''
    const scale = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1])
    expect(scale).toBeGreaterThan(0)
    expect(scale).toBeLessThanOrEqual(0.7)
    expect(valueOf(badge, 'transform-origin', STACKED)).toBe('bottom right')
  })

  it('switches to the compact centre on a narrow header', () => {
    expect(valueOf('.game-scoreboard-header--has-compact .game-scoreboard-center--compact', 'display', NARROW_HEADER)).toBe('block')
  })

  it('styles nothing on the header from its own container query', () => {
    // A container query cannot match its own container, so a rule for the
    // header inside it is dead code that reads as if it worked.
    expect(declsFor('.game-scoreboard-header', NARROW_HEADER)).toEqual([])
  })

  it('keeps the landscape side column on its own #901 card', () => {
    expect(valueOf('.game-landscape-side .game-scoreboard-cell', 'container-type', LANDSCAPE)).toBe('normal')
    expect(valueOf('.game-landscape-side .game-player-avatar', 'width', LANDSCAPE)).toBe('30px')
  })

  it('keeps the conversation games out: their phone right cell is an auto track', () => {
    expect(
      valueOf(':is(.sketch-header-card, .spy-header-card, .alias-header-card, .liars-header-card) .game-scoreboard-cell', 'container-type')
    ).toBe('normal')
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
