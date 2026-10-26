import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const GUIDES_ROOT = join(process.cwd(), 'app', 'guides')

function pageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pageFiles(path)
    return name === 'page.tsx' ? [path] : []
  })
}

describe('guide pages make no promise about ads (#1504)', () => {
  const layout = readFileSync(join(GUIDES_ROOT, 'components', 'GuideLayout.tsx'), 'utf8')
  const guides = pageFiles(GUIDES_ROOT)
    .map((path) => ({ file: relative(process.cwd(), path), source: readFileSync(path, 'utf8') }))
    .filter(({ source }) => source.includes('GuideLayout'))

  it('every guide renders through GuideLayout, which carries an ad slot', () => {
    expect(layout).toMatch(/<AdSlot\b/)
    expect(guides.map(({ file }) => file)).toContain('app/guides/how-to-play-yahtzee-online/page.tsx')
  })

  it.each(guides.map(({ file, source }) => [file, source]))('%s does not say "no ads"', (_file, source) => {
    expect(source).not.toMatch(/\bno ads\b|\bad-free\b|\bwithout ads\b/i)
  })
})
