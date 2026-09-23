import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import type { Metadata } from 'next'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

const findUnique = jest.fn()
jest.mock('@/lib/db', () => ({
  prisma: { lobbies: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}))

import { buildGameMetadata } from '@/lib/game-seo'
import { buildGuideMetadata } from '@/lib/guide-seo'
import { ALL_GUIDES } from '@/lib/guides-catalog'
import { getCatalogGames } from '@/lib/game-catalog'
import { getLobbyPreview, lobbyPreviewText } from '@/lib/lobby-preview'
import { SOCIAL_PROFILES } from '@/lib/social-profiles'
import { organizationNode } from '@/lib/organization-json-ld'
import robots, { LINK_PREVIEW_BOTS } from '@/app/robots'
import {
  OG_SITE_DEFAULTS,
  SOCIAL_IMAGE_HEIGHT,
  SOCIAL_IMAGE_WIDTH,
  gameSocialCardKey,
  getSocialCard,
  getSocialCardKeys,
  guideSocialCardKey,
  socialImages,
} from '@/lib/social-preview'

type OgImage = { url: string; width: number; height: number; alt: string }

function ogImages(meta: Metadata): OgImage[] {
  return (meta.openGraph?.images ?? []) as OgImage[]
}
function twitterImages(meta: Metadata): OgImage[] {
  return (meta.twitter?.images ?? []) as OgImage[]
}

function expectFullPreview(meta: Metadata, key: string) {
  const [og] = ogImages(meta)
  expect(og).toMatchObject({ url: `/og/${key}`, width: SOCIAL_IMAGE_WIDTH, height: SOCIAL_IMAGE_HEIGHT })
  expect(og.alt.length).toBeGreaterThan(0)
  expect(twitterImages(meta)[0]).toMatchObject({ url: `/og/${key}` })
  expect(meta.openGraph).toMatchObject(OG_SITE_DEFAULTS)
  expect((meta.twitter as { card?: string }).card).toBe('summary_large_image')
}

describe('link previews (#1091)', () => {
  it('serves 1200×630 cards', () => {
    expect([SOCIAL_IMAGE_WIDTH, SOCIAL_IMAGE_HEIGHT]).toEqual([1200, 630])
  })

  it('gives every game page its own card and puts it in the head', () => {
    const games = getCatalogGames().filter((game) => game.seo && game.route && game.gameType)
    expect(games.length).toBeGreaterThan(5)
    for (const game of games) {
      const key = gameSocialCardKey(game.id)
      expect(getSocialCard(key)).not.toBeNull()
      expectFullPreview(buildGameMetadata(game.id), key)
    }
  })

  it('gives every guide its own card and puts it in the head', () => {
    for (const guide of ALL_GUIDES) {
      const key = guideSocialCardKey(guide.slug)
      expect(getSocialCard(key)).not.toBeNull()
      expectFullPreview(buildGuideMetadata(guide.slug), key)
    }
  })

  it.each([
    ['app/games/page.tsx', 'games'],
    ['app/games/layout.tsx', 'games'],
    ['app/guides/page.tsx', 'guides'],
    ['app/about/page.tsx', 'about'],
    ['app/premium/page.tsx', 'premium'],
    ['app/leaderboard/page.tsx', 'leaderboard'],
  ])('%s names its card', async (file, key) => {
    const mod = (await import(`@/${file.replace(/\.tsx$/, '')}`)) as { metadata: Metadata }
    expectFullPreview(mod.metadata, key)
  })

  it('does not hand the /games url to every lobbies list under it', async () => {
    const mod = (await import('@/app/games/layout')) as { metadata: Metadata }
    expect((mod.metadata.openGraph as { url?: string }).url).toBeUndefined()
  })

  it('names a card in every page that sets its own openGraph', () => {
    // A page-level openGraph replaces the root one and drops its image, which is
    // how every page but / lost its preview. New pages must not repeat that.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === 'api' || entry.name === 'dev') continue
          walk(full)
        } else if (/^(page|layout)\.tsx$/.test(entry.name)) {
          const source = readFileSync(full, 'utf8')
          if (/openGraph:\s*{/.test(source) && !/images/.test(source) && full !== path.join('app', 'layout.tsx')) {
            offenders.push(full)
          }
        }
      }
    }
    walk('app')
    expect(offenders).toEqual([])
  })

  it('refuses an unknown card key instead of shipping a 404 image', () => {
    expect(() => socialImages('no-such-card')).toThrow()
  })

  it('keys cards with URL-safe names only', () => {
    for (const key of getSocialCardKeys()) expect(key).toMatch(/^[a-z0-9-]+$/)
  })

  it('serves the images outside /api/, which robots.txt disallows', () => {
    expect(existsSync('app/og/[key]/route.tsx')).toBe(true)
    expect(socialImages('games')[0].url.startsWith('/api/')).toBe(false)
  })
})

describe('lobby invite preview (#1091)', () => {
  beforeEach(() => findUnique.mockReset())

  it('says "Join my game of <Game>" and names nobody', async () => {
    findUnique.mockResolvedValue({
      gameType: 'yahtzee',
      isActive: true,
      maxPlayers: 4,
      games: [{ _count: { players: 2 } }],
    })
    const preview = await getLobbyPreview('1234')
    const text = lobbyPreviewText(preview)
    expect(text.title).toBe('Join my game of Yahtzee on Boardly')
    expect(text.description).toContain('2/4 players')

    const select = findUnique.mock.calls[0][0].select
    expect(select.creator).toBeUndefined()
  })

  it('falls back to a generic invite for a closed or unknown lobby', async () => {
    findUnique.mockResolvedValue({ gameType: 'yahtzee', isActive: false, maxPlayers: 4, games: [] })
    expect(lobbyPreviewText(await getLobbyPreview('1234')).title).toBe('Join a game on Boardly')
    findUnique.mockRejectedValue(new Error('db down'))
    expect(lobbyPreviewText(await getLobbyPreview('1234')).title).toBe('Join a game on Boardly')
  })
})

describe('robots.txt and link-preview crawlers (#1091)', () => {
  const { rules } = robots()
  const list = Array.isArray(rules) ? rules : [rules]

  it('keeps search engines out of live lobbies', () => {
    const star = list.find((rule) => rule.userAgent === '*')
    expect(star?.disallow).toContain('/lobby/')
  })

  it('lets the preview bots read an invite link, and still nothing private', () => {
    const preview = list.find((rule) => Array.isArray(rule.userAgent) && rule.userAgent.includes('Twitterbot'))
    expect(preview?.userAgent).toEqual(LINK_PREVIEW_BOTS)
    expect(preview?.disallow).not.toContain('/lobby/')
    expect(preview?.disallow).toEqual(expect.arrayContaining(['/api/', '/profile/', '/friends']))
    expect(LINK_PREVIEW_BOTS).toEqual(expect.arrayContaining(['Twitterbot', 'facebookexternalhit']))
  })
})

describe('social profiles (#1091)', () => {
  it('feeds sameAs from the one list, which stays empty until the accounts exist', () => {
    expect(organizationNode.sameAs).toEqual([
      'https://github.com/KovalDenys1/Boardly',
      ...SOCIAL_PROFILES.map((profile) => profile.url),
    ])
    for (const profile of SOCIAL_PROFILES) expect(profile.url).toMatch(/^https:\/\//)
  })
})
