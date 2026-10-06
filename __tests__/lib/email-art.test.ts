/**
 * The invite mail draws each game from a small map in lib/email-art.ts and names it from
 * EMAIL_GAME_NAMES in lib/email.ts, so neither has to import the catalog or the locale files.
 * These keep both in step with what the site itself shows (#1298).
 */

import en from '@/locales/en'
import no from '@/locales/no'
import { INVITE_HERO_GAMES, inviteHeroImage, EMAIL_ART_BASE } from '@/lib/email-art'
import { EMAIL_GAME_NAMES } from '@/lib/email'
import { getCatalogGames, getGameMetadata } from '@/lib/game-catalog'

function lookup(locale: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

describe('the art and names an invite mail uses (#1298)', () => {
  const originalEnv = { ...process.env }
  beforeAll(() => {
    process.env.ENABLE_TELEPHONE_DOODLE = 'true'
    process.env.ENABLE_FAKE_ARTIST = 'true'
  })
  afterAll(() => {
    process.env = originalEnv
  })

  it.each(Object.entries(INVITE_HERO_GAMES))('%s has the glyph and accent the catalog gives it', (gameType, game) => {
    const meta = getGameMetadata(gameType)

    expect(meta).not.toBeNull()
    expect({ svgId: game.svgId, accent: game.accent }).toEqual({ svgId: meta?.svgId, accent: meta?.accentColor })
  })

  it('names every game with a hero exactly as the English and Norwegian site do', () => {
    const catalog = getCatalogGames({ includeInDevelopment: true } as Parameters<typeof getCatalogGames>[0])
    for (const gameType of Object.keys(INVITE_HERO_GAMES)) {
      const entry = catalog.find((game) => game.gameType === gameType)
      expect(entry).toBeDefined()
      expect(EMAIL_GAME_NAMES[gameType]).toEqual({ en: lookup(en, entry!.nameKey), nb: lookup(no, entry!.nameKey) })
    }
  })

  it('falls back to the welcome hero for a game without its own picture', () => {
    expect(inviteHeroImage('not_a_game', 'x').light).toBe(`${EMAIL_ART_BASE}hero-welcome-light.png`)
    expect(inviteHeroImage('guess_the_spy', 'x').light).toBe(`${EMAIL_ART_BASE}hero-invite-spy-light.png`)
  })
})
