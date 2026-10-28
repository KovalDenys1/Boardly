import { readdirSync } from 'node:fs'
import path from 'node:path'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import nextConfig from '@/next.config.js'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { deriveSignupSource } from '@/lib/signup-source'
import { getCatalogGames } from '@/lib/game-catalog'
import { SOCIAL_SHORT_LINKS, SOCIAL_SHORT_LINK_GAME_SLUGS, socialShortLinkRedirects } from '@/lib/social-short-links'

type Redirect = { source: string; destination: string; permanent?: boolean; has?: unknown }

/** Resolves a path the way Next's custom routes do: first matching rule wins. */
async function resolve(pathname: string): Promise<{ status: number; url: URL } | null> {
  const redirects = (await nextConfig.redirects!()) as Redirect[]
  for (const rule of redirects) {
    if (rule.has) continue // host-conditioned (www -> apex), not a path rule
    const params = getPathMatch(rule.source, { strict: true, removeUnnamedParams: true })(pathname)
    if (!params) continue
    const destination = rule.destination.replace(/:(\w+)/g, (_, key: string) =>
      String((params as Record<string, unknown>)[key] ?? ''),
    )
    return { status: rule.permanent ? 308 : 307, url: new URL(destination, 'https://boardly.online') }
  }
  return null
}

describe('social short links (#1096)', () => {
  const expected: Record<string, string> = {
    '/tt': 'tiktok.com',
    '/ig': 'instagram.com',
    '/yt': 'youtube.com',
    '/fb': 'facebook.com',
    '/th': 'threads.com',
    '/pin': 'pinterest.com',
    '/x': 'x.com',
  }

  it.each(Object.entries(expected))('%s lands on the home page as %s / social / profile', async (short, source) => {
    const hit = await resolve(short)
    expect(hit).not.toBeNull()
    expect(hit!.status).toBe(307)
    expect(hit!.url.pathname).toBe('/')
    expect(Object.fromEntries(hit!.url.searchParams)).toEqual({
      utm_source: source,
      utm_medium: 'social',
      utm_campaign: 'profile',
    })
  })

  it('covers exactly the listed networks', () => {
    expect(Object.fromEntries(SOCIAL_SHORT_LINKS.map((l) => [l.path, l.source]))).toEqual(expected)
  })

  it('passes a valid campaign segment through', async () => {
    for (const campaign of ['ai', 'ai_skit', 'launch-2026', 'a'.repeat(32)]) {
      const hit = await resolve(`/tt/${campaign}`)
      expect(hit!.status).toBe(307)
      expect(hit!.url.pathname).toBe('/')
      expect(hit!.url.searchParams.get('utm_source')).toBe('tiktok.com')
      expect(hit!.url.searchParams.get('utm_campaign')).toBe(campaign)
    }
  })

  it('falls back to the default campaign for anything it will not pass through', async () => {
    // `/ig/` never reaches these rules: Next's trailing-slash redirect makes it `/ig` first.
    for (const bad of ['/ig/a%20b', '/ig/' + 'a'.repeat(33), '/ig/a.b', '/ig/one/two', '/ig/%3Cscript%3E']) {
      const hit = await resolve(bad)
      expect(hit).not.toBeNull()
      expect(hit!.url.searchParams.get('utm_source')).toBe('instagram.com')
      expect(hit!.url.searchParams.get('utm_campaign')).toBe('profile')
    }
  })

  it('matches case-insensitively, as Next builds custom routes (sensitive: false)', async () => {
    const hit = await resolve('/TT')
    expect(hit!.url.searchParams.get('utm_source')).toBe('tiktok.com')
  })

  it('does not catch paths that merely start with the same letters', async () => {
    for (const other of ['/xyz', '/tty', '/pinned', '/the', '/games', '/guides/yahtzee']) {
      const hit = await resolve(other)
      expect(hit?.url.searchParams.get('utm_medium') ?? null).not.toBe('social')
    }
  })

  it('is stored as utm:<platform host>/social/<campaign>, the same source a referrer visit gets', () => {
    expect(
      deriveSignupSource({ utmSource: 'tiktok.com', utmMedium: 'social', utmCampaign: 'profile' }),
    ).toBe('utm:tiktok.com/social/profile')
    expect(deriveSignupSource({ referrer: 'https://www.tiktok.com/@boardly', currentHostname: 'boardly.online' })).toBe(
      'ref:tiktok.com',
    )
  })

  it('collides with no page or route in app/', () => {
    const app = path.join(process.cwd(), 'app')
    const top = new Set([...readdirSync(app), ...readdirSync(path.join(app, '(site)'))])
    for (const { path: p } of SOCIAL_SHORT_LINKS) expect(top.has(p.slice(1))).toBe(false)
  })

  it('is kept out of search: disallowed (anchored) in robots.txt and absent from the sitemap', () => {
    const rules = robots().rules
    const disallow = (Array.isArray(rules) ? rules : [rules]).flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : [],
    )
    for (const { path: p } of SOCIAL_SHORT_LINKS) {
      expect(disallow).toContain(`${p}$`)
      expect(disallow).toContain(`${p}/`)
      expect(disallow).not.toContain(p)
    }
    const urls = sitemap().map((e) => new URL(e.url).pathname)
    for (const { path: p } of SOCIAL_SHORT_LINKS) {
      expect(urls.some((u) => u === p || u.startsWith(`${p}/`))).toBe(false)
    }
  })

  describe('a campaign that starts with a game slug lands on the game (#1540)', () => {
    it.each(Object.entries(expected))('%s/checkers-trap goes to /games/checkers as %s', async (short, source) => {
      const hit = await resolve(`${short}/checkers-trap`)
      expect(hit!.status).toBe(307)
      expect(hit!.url.pathname).toBe('/games/checkers')
      expect(Object.fromEntries(hit!.url.searchParams)).toEqual({
        utm_source: source,
        utm_medium: 'social',
        utm_campaign: 'checkers-trap',
      })
    })

    it('takes the bare slug', async () => {
      const hit = await resolve('/tt/connect-four')
      expect(hit!.url.pathname).toBe('/games/connect-four')
      expect(hit!.url.searchParams.get('utm_campaign')).toBe('connect-four')
    })

    it('takes the slug with a suffix', async () => {
      for (const [short, game] of [
        ['/tt/connect-four-trap', 'connect-four'],
        ['/pin/checkers-solved', 'checkers'],
        ['/ig/rock-paper-scissors_rematch', 'rock-paper-scissors'],
        ['/yt/spy-' + 'a'.repeat(28), 'spy'],
      ]) {
        const hit = await resolve(short)
        expect(hit!.url.pathname).toBe(`/games/${game}`)
        expect(hit!.url.searchParams.get('utm_campaign')).toBe(short.split('/')[2])
      }
    })

    it('leaves any other campaign on the home page', async () => {
      for (const [short, campaign] of [
        ['/tt/profile', 'profile'],
        ['/tt', 'profile'],
        ['/tt/ai_skit', 'ai_skit'],
        ['/tt/spyglass', 'spyglass'],
        ['/tt/checkers2', 'checkers2'],
        ['/tt/four-in-a-row', 'four-in-a-row'],
        ['/tt/connect-four-' + 'a'.repeat(20), 'profile'],
      ]) {
        const hit = await resolve(short)
        expect(hit!.url.pathname).toBe('/')
        expect(hit!.url.searchParams.get('utm_campaign')).toBe(campaign)
      }
    })

    it('knows exactly the catalog games that have a /games/<slug> page', () => {
      const fromCatalog = getCatalogGames()
        .map((game) => game.route?.match(/^\/games\/([^/]+)\//)?.[1])
        .filter((slug): slug is string => Boolean(slug))
      const games = path.join(process.cwd(), 'app', '(site)', 'games')
      const fromPages = readdirSync(games, { withFileTypes: true })
        .filter((d) => d.isDirectory() && readdirSync(path.join(games, d.name)).includes('page.tsx'))
        .map((d) => d.name)
      expect([...SOCIAL_SHORT_LINK_GAME_SLUGS].sort()).toEqual([...new Set(fromCatalog)].sort())
      expect([...SOCIAL_SHORT_LINK_GAME_SLUGS].sort()).toEqual(fromPages.sort())
    })
  })

  it('emits only temporary redirects', () => {
    for (const rule of socialShortLinkRedirects()) expect(rule.permanent).toBe(false)
  })
})
