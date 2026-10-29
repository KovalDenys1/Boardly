import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const GUIDES_ROOT = join(process.cwd(), 'app', '(site)', 'guides')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

/** "No ads" in every language a guide is written in. */
const NO_ADS = /\bno ads\b|\bad-free\b|\bwithout ads\b|без\s+реклам|uten\s+reklame|reklamefri/i

describe('guide pages make no promise about ads (#1504)', () => {
  const read = (path: string) => readFileSync(path, 'utf8')
  const sources = sourceFiles(GUIDES_ROOT).map((path) => ({ file: relative(process.cwd(), path), source: read(path) }))
  const pages = sources.filter(({ file }) => file.endsWith('page.tsx') && !file.endsWith(join('guides', 'page.tsx')))

  it('every guide renders through GuidePage and GuideLayout, which carries an ad slot', () => {
    expect(read(join(GUIDES_ROOT, 'components', 'GuideLayout.tsx'))).toMatch(/<AdSlot\b/)
    expect(read(join(GUIDES_ROOT, 'components', 'GuidePage.tsx'))).toMatch(/<GuideLayout\b/)
    expect(pages.map(({ file }) => file)).toContain('app/(site)/guides/how-to-play-yahtzee-online/page.tsx')
    for (const { source } of pages) expect(source).toMatch(/<GuidePage\b/)
  })

  it.each(sources.map(({ file, source }) => [file, source]))('%s does not say "no ads"', (_file, source) => {
    expect(source).not.toMatch(NO_ADS)
  })
})
