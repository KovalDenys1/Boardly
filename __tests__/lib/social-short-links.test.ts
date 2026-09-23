import { readdirSync } from 'node:fs'
import path from 'node:path'
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match'
import nextConfig from '@/next.config.js'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { deriveSignupSource } from '@/lib/signup-source'
import { SOCIAL_SHORT_LINKS, socialShortLinkRedirects } from '@/lib/social-short-links'

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
    const top = new Set(readdirSync(path.join(process.cwd(), 'app')))
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

  it('emits only temporary redirects', () => {
    for (const rule of socialShortLinkRedirects()) expect(rule.permanent).toBe(false)
  })
})
