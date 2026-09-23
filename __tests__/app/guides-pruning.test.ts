import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import nextConfig from '@/next.config.js'
import sitemap from '@/app/sitemap'
import { ALL_GUIDES } from '@/lib/guides-catalog'

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')
const BASE = 'https://boardly.online'

/**
 * The three guides #923 merged away, and the page each URL now points at. They
 * were indexed, so the redirect is the deliverable – dropping the directory on
 * its own would have left three 404s in Search Console.
 */
const MERGED_GUIDES: Record<string, string> = {
  '/guides/best-free-multiplayer-browser-games': '/games',
  '/guides/best-3-player-games-online': '/guides/best-online-games-for-game-night',
  '/guides/best-party-games-online': '/guides/best-online-games-for-game-night',
  // #1077: "Crawled – currently not indexed"; its strategy moved to /games/yahtzee#strategy.
  '/guides/yahtzee-strategy-guide': '/games/yahtzee',
}

/** Minimum body copy for a guide to earn its own URL (#923 acceptance). */
const MIN_WORDS = 600

/**
 * Words a visitor actually reads: the JSX text and the prose string literals of
 * the page component, with the <head> region removed. `metadata` keywords and
 * the JSON-LD blocks are markup for crawlers, not content, and counting them
 * was how every one of these pages looked longer than it was.
 */
function proseWordCount(source: string): number {
  let body = source
    .replace(/^export const metadata: Metadata = \{[\s\S]*?^\}\n/m, '')
    .replace(/^const \w*[Jj]sonLd = \{[\s\S]*?^\}\n/gm, '')
    .replace(/^import .*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/className=("[^"]*"|\{[^{}]*(\{[^{}]*\}[^{}]*)*\})/g, ' ')
    .replace(/style=\{\{[\s\S]*?\}\}/g, ' ')

  let words = 0
  const countIfProse = (raw: string) => {
    const value = raw.trim()
    if (!value || /^(https?:|\/|var\(|@|#|[a-z-]+$)/.test(value)) return
    const parts = value.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) words += parts.length
  }

  for (const match of body.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) countIfProse(match[2])
  for (const match of body.matchAll(/>([^<>{}]+)</g)) countIfProse(match[1])
  return words
}

const guideDirs = readdirSync(path.join(root, 'app', 'guides'))
  .filter((entry) => entry !== 'components')
  .filter((entry) => statSync(path.join(root, 'app', 'guides', entry)).isDirectory())

describe('guide pruning (#923)', () => {
  it('has no page left for a merged guide', () => {
    for (const merged of Object.keys(MERGED_GUIDES)) {
      expect(guideDirs).not.toContain(merged.replace('/guides/', ''))
      expect(ALL_GUIDES.map((guide) => guide.slug)).not.toContain(merged.replace('/guides/', ''))
    }
  })

  it('301s every merged URL to a page that exists', async () => {
    expect(nextConfig.redirects).toBeDefined()
    const redirects = await nextConfig.redirects!()
    for (const [source, destination] of Object.entries(MERGED_GUIDES)) {
      const rule = redirects.find((entry) => entry.source === source)
      expect(rule).toBeDefined()
      expect(rule?.destination).toBe(destination)
      expect(rule?.permanent).toBe(true)
      expect(() => read(`app${destination}/page.tsx`)).not.toThrow()
    }
  })

  it('leaves no internal link pointing at a merged guide', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(root, dir))) {
        const rel = `${dir}/${entry}`
        if (statSync(path.join(root, rel)).isDirectory()) {
          walk(rel)
          continue
        }
        if (!/\.tsx?$/.test(entry)) continue
        const source = readFileSync(path.join(root, rel), 'utf8')
        for (const merged of Object.keys(MERGED_GUIDES)) {
          if (source.includes(merged)) offenders.push(`${rel} -> ${merged}`)
        }
      }
    }
    walk('app')
    walk('components')
    walk('lib')
    expect(offenders).toEqual([])
  })

  it('never puts a redirected URL in the sitemap', () => {
    const paths = sitemap().map((entry) => entry.url.slice(BASE.length) || '/')
    for (const merged of Object.keys(MERGED_GUIDES)) expect(paths).not.toContain(merged)
  })
})

describe('guide content bar (#923)', () => {
  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s carries at least %s words', (slug) => {
    expect(proseWordCount(read(`app/guides/${slug}/page.tsx`))).toBeGreaterThanOrEqual(MIN_WORDS)
  })

  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s opens with a question and its answer', (slug) => {
    const source = read(`app/guides/${slug}/page.tsx`)
    expect(source).toContain(`slug="${slug}"`)

    const question = source.match(/\n\s+question="([^"]+)"/)
    expect(question?.[1]).toMatch(/\?$/)

    const answer = source.match(/\n\s+answer="([^"]+)"/)
    expect(answer?.[1]?.split(/\s+/).length ?? 0).toBeGreaterThanOrEqual(12)
  })

  it('draws the question as an h2 and shows when the guide was last updated', () => {
    const layout = read('app/guides/components/GuideLayout.tsx')
    expect(layout).toMatch(/<h2[\s\S]*?\{question\}/)
    expect(layout).toContain('Last updated')
    // the date is the catalog's, so a content change moves the page and the
    // sitemap together instead of drifting apart
    expect(layout).toContain('getGuideBySlug(slug).updated')
  })
})
