import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { zIndexLines, zLayers } from '../../scripts/z-layer-rules'

const root = path.join(__dirname, '..', '..')
const globalsCss = readFileSync(path.join(root, 'app', 'globals.css'), 'utf8')

describe('the layer scale (#1556)', () => {
  it('declares the layers in @theme, from page-level floating controls up to the celebration', () => {
    expect([...zLayers(globalsCss)]).toEqual([
      ['floating', 30],
      ['header', 40],
      ['dropdown', 50],
      ['drawer', 60],
      ['dialog', 70],
      ['toast', 80],
      ['celebration', 90],
    ])
  })
})

describe('a z-index off the scale', () => {
  it.each([
    ['a raw z-50', '<header className="site-header sticky top-0 z-50">'],
    ['a number between two layers', '<div className="fixed inset-0 z-61 flex">'],
    ['a variant', '<a className="sr-only focus:z-999">'],
    ['an arbitrary value', '<div className="z-[60]">'],
    ['a variable', '<div className="z-(--my-layer)">'],
    ['an inline style', "style={{ position: 'fixed', zIndex: 60 }}"],
    ['a library option', 'const defaults = { ticks: 60, zIndex: 9999 }'],
    ['a CSS declaration', '  z-index: 60;'],
  ])('flags %s', (_label, line) => {
    expect(zIndexLines(line)).toEqual([1])
  })

  it.each([
    ['a layer utility', '<div className="fixed inset-0 z-dialog">'],
    ['a layer under a variant', '<a className="focus:z-toast">'],
    ['stacking inside a component', '<div className="absolute inset-0 z-0" /><div className="relative z-10">'],
    ['a negative local value', '<span className="-z-1">'],
    ['a small inline value', "style={{ position: 'absolute', zIndex: 10 }}"],
    ['a layer in an inline style', "style={{ zIndex: 'var(--z-index-drawer)' }}"],
    ['a small CSS value', '.yz-sheet__row--head { position: sticky; top: 0; z-index: 2; }'],
    ['a layer in CSS', '  z-index: var(--z-index-dropdown);'],
    ['a class that only ends in z', '<div className="yz-celebration fixed">'],
    ['prose', '// every z-index above a component comes from the scale'],
  ])('leaves %s alone', (_label, line) => {
    expect(zIndexLines(line)).toEqual([])
  })
})

describe('the app', () => {
  it('sets no z-index off the scale in app, components, contexts, hooks or lib', () => {
    const found: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(tsx?|css)$/.test(name)) for (const line of zIndexLines(readFileSync(full, 'utf8'))) found.push(`${path.relative(root, full)}:${line}`)
      }
    }
    for (const dir of ['app', 'components', 'contexts', 'hooks', 'lib']) walk(path.join(root, dir))
    expect(found).toEqual([])
  })
})
