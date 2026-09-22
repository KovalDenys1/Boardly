import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The matcher is one negative-lookahead regex, and a typo in it fails open (the
 * proxy runs on files it should leave alone) or closed (it runs on nothing at
 * all) with no other test noticing. The string is read out of the source rather
 * than imported, because `proxy.ts` pulls in next-auth's ESM build and because
 * Next.js requires the matcher to be a statically analyzable literal – so the
 * source is the only place it exists.
 */
const source = readFileSync(path.join(process.cwd(), 'proxy.ts'), 'utf8')
const matcher = source.match(/matcher: \[\n\s*'([^']+)',\n\s*\],/)?.[1]

// The source holds a TypeScript string literal, so `\.` is written `\\.` there.
// Undo that one escaping level to get the pattern Next.js compiles at runtime.
const pattern = new RegExp(`^${(matcher ?? '').replace(/\\\\/g, '\\')}$`)
const runsOn = (route: string) => pattern.test(route)

describe('proxy matcher', () => {
  it('has exactly one matcher, and it compiles', () => {
    expect(matcher).toBeDefined()
    expect(source.match(/matcher:/g)).toHaveLength(1)
  })

  it.each([
    '/robots.txt',
    '/sitemap.xml',
    '/ads.txt',
    '/manifest.json',
    '/sw.js',
    '/offline.html',
    '/0b12a34ebc4e0bbe955eb42d3e0a49f3.txt',
    '/.well-known/security.txt',
    '/_next/static/chunks/main.js',
    '/_next/image',
    '/favicon.ico',
  ])('skips %s – a file for crawlers and browsers, never a session', (route) => {
    expect(runsOn(route)).toBe(false)
  })

  it.each([
    '/',
    '/games',
    '/games/yahtzee',
    '/guides/how-to-play-yahtzee-online',
    '/api/lobbies',
    '/lobby/ABCD',
    '/u/someone',
    '/premium',
  ])('still runs on %s', (route) => {
    expect(runsOn(route)).toBe(true)
  })

  it('does not skip a page whose name merely starts like an excluded file', () => {
    // a careless `sitemap` or `robots` entry, without the escaped extension,
    // would swallow these
    expect(runsOn('/sitemapping')).toBe(true)
    expect(runsOn('/robots-guide')).toBe(true)
    expect(runsOn('/adsense-policy')).toBe(true)
  })

  it('skips the IndexNow key file by shape, not by its current value', () => {
    expect(runsOn('/ffffffffffffffffffffffffffffffff.txt')).toBe(false)
    // too short to be a key: a real page, and the proxy should run on it
    expect(runsOn('/abc123.txt')).toBe(true)
  })
})
