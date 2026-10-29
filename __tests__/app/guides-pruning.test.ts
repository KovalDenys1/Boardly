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
  // #1090: same verdict; its strategy moved to /games/connect-four#strategy.
  '/guides/connect-four-strategy-guide': '/games/connect-four',
}

/** Minimum body copy for a guide to earn its own URL (#923 acceptance). */
const MIN_WORDS = 600

/** A guide's English copy: every word of the page, kept apart from its markup since #1583. */
const englishCopy = (slug: string): { question: string; answer: string } =>
  require(`../../app/(site)/guides/${slug}/copy/en`).default

/**
 * Words a visitor actually reads: every prose string of the copy, a link counted by its label.
 * Single words and paths are left out – a label like "Easy" or an href is not body copy, and
 * counting them is how these pages once looked longer than they were.
 */
function proseWordCount(copy: unknown): number {
  if (typeof copy === 'string') {
    const value = copy.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
    if (!value || /^(https?:|\/|var\(|@|#|[a-z-]+$)/.test(value)) return 0
    const words = value.split(/\s+/).filter(Boolean).length
    return words >= 2 ? words : 0
  }
  if (!copy || typeof copy !== 'object') return 0
  return Object.values(copy as Record<string, unknown>).reduce<number>((sum, value) => sum + proseWordCount(value), 0)
}

const guideDirs = readdirSync(path.join(root, 'app', '(site)', 'guides'))
  .filter((entry) => entry !== 'components')
  .filter((entry) => statSync(path.join(root, 'app', '(site)', 'guides', entry)).isDirectory())

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
      expect(() => read(`app/(site)${destination}/page.tsx`)).not.toThrow()
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
    expect(proseWordCount(englishCopy(slug))).toBeGreaterThanOrEqual(MIN_WORDS)
  })

  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s opens with a question and its answer', (slug) => {
    expect(read(`app/(site)/guides/${slug}/guide.tsx`)).toContain(`slug: '${slug}'`)

    const { question, answer } = englishCopy(slug)
    expect(question).toMatch(/\?$/)
    expect(answer.split(/\s+/).length).toBeGreaterThanOrEqual(12)
  })

  it('draws the question as an h2 and shows when the guide was last updated', () => {
    const layout = read('app/(site)/guides/components/GuideLayout.tsx')
    expect(layout).toMatch(/<h2[\s\S]*?\{question\}/)
    expect(layout).toContain('Last updated')
    // the date is the catalog's, so a content change moves the page and the
    // sitemap together instead of drifting apart
    expect(layout).toContain('getGuideBySlug(slug).updated')
  })
})
