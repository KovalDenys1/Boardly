import { readFileSync } from 'fs'
import path from 'path'
import postcss, { type AtRule } from 'postcss'

/**
 * Boards fill their card at every width (#1566).
 *
 * Each board's size is the min() of a width-derived and a height-derived term,
 * read off the board card's container units. A fixed cap on top of that is
 * what left a tablet's Connect Four board 255px short of its card: once the
 * cap binds before either axis does, the board stops growing and the rest of
 * the card is empty. jsdom evaluates no container units, so the formulas are
 * read out of globals.css and evaluated here for the board cards the real
 * layouts produce.
 */
const css = postcss.parse(readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8'))

function declaration(selector: string, prop: string): string {
  let found: string | undefined
  css.walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return
    for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
      if (node.type === 'atrule' && (node as AtRule).name !== 'layer') return
    }
    rule.walkDecls(prop, (decl) => {
      found = decl.value
    })
  })
  if (!found) throw new Error(`no unconditional ${selector} { ${prop} }`)
  return found
}

/** Evaluates a calc/min/clamp length in px for a container of `width` × `height`. */
function evaluate(expression: string, width: number, height: number): number {
  const js = expression
    .replace(/var\(--grid-cols,\s*(\d+)\)/g, '$1')
    .replace(/var\(--grid-rows,\s*(\d+)\)/g, '$1')
    .replace(/100cqw/g, String(width))
    .replace(/100cqh/g, String(height))
    .replace(/(\d+(?:\.\d+)?)px/g, '$1')
    .replace(/clamp\(/g, '__clamp(')
    .replace(/min\(/g, 'Math.min(')
    .replace(/calc\(/g, '(')
  if (/[a-z]{2,}/i.test(js.replace(/Math\.min|__clamp/g, ''))) throw new Error(`cannot evaluate ${expression}`)
  return new Function('__clamp', `return ${js}`)((lo: number, value: number, hi: number) => Math.min(Math.max(lo, value), hi))
}

/** The same expression with its upper bound removed: what the card alone allows. */
function uncapped(expression: string): string {
  return expression
    .replace(/,\s*\d+px\)\s*$/, ', 100000px)')
    .replace(/,\s*\d+px,\s*calc/, ', calc')
}

const BOARDS = [
  { name: 'Connect Four cell', selector: '.ttt-board-card', prop: '--c4-cell' },
  { name: 'Checkers cell', selector: '.ck-board', prop: '--ck-cell' },
  { name: 'Tic-tac-toe board', selector: '.ttt-board-wrap', prop: 'width' },
  { name: 'Ludo board', selector: '.ludo-board', prop: 'width' },
] as const

// Board cards measured in the live layouts: a 768x1024 tablet's Board tab, a
// 1440x900 desktop's centre column, and the widest the 1280px grid allows.
const CARDS = [
  { label: 'tablet portrait', width: 728, height: 700 },
  { label: '1440x900 desktop', width: 860, height: 650 },
  { label: 'widest grid', width: 900, height: 900 },
]

describe('boards fill their card (#1566)', () => {
  for (const board of BOARDS) {
    it(`${board.name}: the card, not a fixed cap, stops the board`, () => {
      const value = declaration(board.selector, board.prop)
      expect(value).toMatch(/min\(/)
      expect(value).toMatch(/100cqw/)
      expect(value).toMatch(/100cqh/)
      for (const card of CARDS) {
        expect(evaluate(value, card.width, card.height)).toBeCloseTo(evaluate(uncapped(value), card.width, card.height), 3)
      }
    })
  }

  it('Memory grid: the card, not a fixed cap, stops the grid', () => {
    let value: string | undefined
    css.walkAtRules('container', (at) => {
      at.walkRules('.memory-grid', (rule) => rule.walkDecls('width', (decl) => { value = decl.value }))
    })
    expect(value).toBeDefined()
    expect(value).toMatch(/100cqh/)
    const withoutCap = value!.replace(/,\s*\d+px,\s*calc/, ', calc')
    for (const card of CARDS) {
      expect(evaluate(value!, card.width, card.height)).toBeCloseTo(evaluate(withoutCap, card.width, card.height), 3)
    }
  })
})
