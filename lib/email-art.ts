import { BOARDLY_URL } from './organization-json-ld'

/** Every picture a mail shows lives here, under https://boardly.online/email/. */
export const EMAIL_ART_BASE = `${BOARDLY_URL}/email/`

export const EMAIL_LOGO_SIZE = { width: 132, height: 40 } as const
export const EMAIL_HERO_SIZE = { width: 540, height: 200 } as const
/** Device pixels per drawn pixel in each PNG. */
export const EMAIL_ART_SCALE = { logo: 3, hero: 2 } as const

/** The hero at the top of each mail; an invite's hero is its game's, see INVITE_HERO_GAMES. */
export const EMAIL_HEROES = [
  'welcome',
  'premium',
  'verify',
  'reset',
  'security',
  'email-change',
  'unverified',
  'deletion',
  'subscription',
  'inactive',
  'terms',
  'suspension',
  'provider-discord',
  'provider-google',
  'provider-github',
] as const

export type EmailHero = (typeof EMAIL_HEROES)[number]

/**
 * The games an invite can be for, with the glyph and accent the catalog gives each one
 * (lib/game-catalog.ts; __tests__/lib/email-art.test.ts keeps the two in step). Each has
 * its own invite hero.
 */
export const INVITE_HERO_GAMES = {
  yahtzee: { svgId: 'yahtzee', accent: 'var(--bd-sky)' },
  guess_the_spy: { svgId: 'spy', accent: 'var(--bd-lav)' },
  tic_tac_toe: { svgId: 'tic-tac-toe', accent: 'var(--bd-coral)' },
  memory: { svgId: 'memory', accent: 'var(--bd-mint)' },
  connect_four: { svgId: 'connect-four', accent: 'var(--bd-coral)' },
  alias: { svgId: 'alias', accent: 'var(--bd-coral)' },
  liars_party: { svgId: 'liars-party', accent: 'var(--bd-lav)' },
  rock_paper_scissors: { svgId: 'rps', accent: 'var(--bd-sun)' },
  sketch_and_guess: { svgId: 'guess-my-drawing', accent: 'var(--bd-mint)' },
  checkers: { svgId: 'checkers', accent: 'var(--bd-coral)' },
  ludo: { svgId: 'ludo', accent: 'var(--bd-sun)' },
  fake_artist: { svgId: 'fake-artist', accent: 'var(--bd-lav)' },
  telephone_doodle: { svgId: 'telephone-doodle', accent: 'var(--bd-sky)' },
} as const satisfies Record<string, { svgId: string; accent: string }>

export type EmailImage = { light: string; dark: string; width: number; height: number; alt: string }

function pair(file: string, size: { width: number; height: number }, alt: string): EmailImage {
  return { light: `${EMAIL_ART_BASE}${file}-light.png`, dark: `${EMAIL_ART_BASE}${file}-dark.png`, ...size, alt }
}

export const EMAIL_LOGO_IMAGE = pair('logo', EMAIL_LOGO_SIZE, 'Boardly')

export function heroImage(kind: EmailHero, alt: string): EmailImage {
  return pair(`hero-${kind}`, EMAIL_HERO_SIZE, alt)
}

/** The invite hero for a game type, or the welcome hero for one without its own. */
export function inviteHeroImage(gameType: string, alt: string): EmailImage {
  const svgId = INVITE_HERO_GAMES[gameType as keyof typeof INVITE_HERO_GAMES]?.svgId
  return svgId ? pair(`hero-invite-${svgId}`, EMAIL_HERO_SIZE, alt) : heroImage('welcome', alt)
}

/** Every file name the mails can reference, for the generator's check and the tests. */
export function allEmailArtFiles(): string[] {
  const stems = [
    'logo',
    ...EMAIL_HEROES.map((kind) => `hero-${kind}`),
    ...Object.values(INVITE_HERO_GAMES).map((game) => `hero-invite-${game.svgId}`),
  ]
  return stems.flatMap((stem) => [`${stem}-light.png`, `${stem}-dark.png`])
}
