import { readFileSync } from 'fs'
import path from 'path'
import postcss, { type AtRule, type Declaration } from 'postcss'

/**
 * Touch targets in the shared in-game chrome (#1345): Leave, the mobile tabs and
 * the result overlay's buttons are at least 44px on a phone. jsdom lays nothing
 * out, so these read the stylesheet.
 */
const root = postcss.parse(readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8'))

function px(selector: string, prop: string): number {
  let value: string | undefined
  root.walkRules((rule) => {
    const at = rule.parent?.type === 'atrule' ? (rule.parent as AtRule).name : ''
    if (at === 'media' || at === 'container' || !rule.selectors.includes(selector)) return
    rule.each((node) => {
      if (node.type === 'decl' && (node as Declaration).prop === prop) value = (node as Declaration).value
    })
  })
  return Number.parseFloat(value ?? '0')
}

describe('game chrome tap targets (#1345)', () => {
  it('makes the Leave tile at least 44px both ways, icon-only included', () => {
    expect(px('.game-leave-button', 'min-height')).toBeGreaterThanOrEqual(44)
    expect(px('.game-leave-button', 'min-width')).toBeGreaterThanOrEqual(44)
  })

  it('makes each mobile game tab at least 44px tall', () => {
    expect(px('.game-tab', 'min-height')).toBeGreaterThanOrEqual(44)
  })

  it('makes every result overlay button at least 44px tall', () => {
    expect(px('.game-result-overlay__primary', 'min-height')).toBeGreaterThanOrEqual(44)
    expect(px('.game-result-overlay__ghost', 'min-height')).toBeGreaterThanOrEqual(44)
  })
})
