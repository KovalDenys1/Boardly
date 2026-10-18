/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { getCatalogAvailableGames } from '@/lib/game-catalog'

const root = process.cwd()
const listingDir = path.join(root, 'android/listing')

interface Listing {
  title: string
  shortDescription: string
  fullDescription: string
  gameNames: Record<string, string>
}

interface ListingFile {
  packageName: string
  languages: string[]
  listings: Record<string, Listing>
  releaseNotes: Record<string, Record<string, string>>
}

const listingFile: ListingFile = JSON.parse(readFileSync(path.join(listingDir, 'listing.json'), 'utf8'))
const storeSettings = readFileSync(path.join(listingDir, 'store-settings.md'), 'utf8')
const twaManifest = JSON.parse(readFileSync(path.join(root, 'android/twa-manifest.json'), 'utf8'))

// Play Console's own codes (answer/9844778): Norwegian is no-NO and Russian ru-RU, not nb-NO and ru.
const PLAY_LANGUAGES = ['en-US', 'no-NO', 'de-DE', 'es-ES', 'uk', 'ru-RU']

// Play counts characters, not UTF-16 code units, so a Cyrillic or emoji-free text is measured the same way.
const length = (text: string) => [...text].length

// A Cyrillic word has no \b in a JS regex, so a word edge is "no letter on that side".
const word = (pattern: string) => new RegExp(`(?<!\\p{L})(?:${pattern})(?!\\p{L})`, 'iu')
const stem = (pattern: string) => new RegExp(`(?<!\\p{L})(?:${pattern})`, 'iu')

// The app sells nothing (#1465), so the listing names no price, purchase, plan or upgrade.
const COMMERCE_EVERYWHERE: RegExp[] = [
  /premium/i,
  /преміум|премиум/i,
  /[$€£¥]/,
  word('kr|nok|usd|eur'),
  stem('upgrad'),
  stem('in-app'),
]

const COMMERCE_BY_LANGUAGE: Record<string, RegExp[]> = {
  'en-US': [stem('buy|purchas|subscri|pric|cost'), word('free|paid|pay')],
  'no-NO': [stem('kjøp|abonnement|oppgrader|betal'), word('gratis|pris|prisen|priser')],
  'de-DE': [/kauf/i, stem('kostenlos|abonnement|bezahl|aufrüst'), word('abo|gratis|umsonst|preis|preise')],
  'es-ES': [stem('suscrip|gratuit|precio'), word('gratis|compra|compras|comprar|compre|pagar|pago')],
  uk: [stem('купи|купів|покупк|придба|безкоштовн|підписк|оплат|апгрейд'), word('ціна|ціни|ціну|ціною')],
  'ru-RU': [stem('купи|покупк|приобре|бесплатн|подписк|оплат|апгрейд'), word('цена|цены|цену|ценой')],
}

// Play's metadata policy (answer/9898842): no ranking claims, emoji, ALL CAPS or other brands' names.
const RANKING_BY_LANGUAGE: Record<string, RegExp[]> = {
  'en-US': [word('best|top-rated|number one|award|awards')],
  'no-NO': [word('beste|best|nummer én|nummer en')],
  'de-DE': [word('beste|bester|bestes|besten|nummer eins')],
  'es-ES': [word('mejor|mejores|número uno')],
  uk: [stem('найкращ|кращ|номер один')],
  'ru-RU': [stem('лучш|номер один')],
}

// Third-party game brands the site's own names would otherwise put in the listing (Yahtzee, Connect
// Four, Vier gewinnt and Alias in the locale files), and apps the listing must not lean on.
const OTHER_BRANDS: RegExp[] = [
  /yahtzee|kniffel|scrabble|monopoly|pictionary|spyfall|codenames|hasbro|ravensburger|mattel|tactic/i,
  /connect\s*(4|four)|vier gewinnt|mensch ärgere|parch[ií]s/i,
  word('alias|алиас|аліас|memory'),
  /\bUNO\b/,
  /google|discord|github|whatsapp|tiktok|instagram|facebook|youtube/i,
  /[®™©]/,
]

function textsOf(language: string): Array<[string, string]> {
  const listing = listingFile.listings[language]
  return [
    ['title', listing.title],
    ['shortDescription', listing.shortDescription],
    ['fullDescription', listing.fullDescription],
    ['releaseNotes 1.0.0', listingFile.releaseNotes['1.0.0'][language]],
  ]
}

function matchesOf(text: string, patterns: RegExp[]): string[] {
  return patterns.flatMap((pattern) => text.match(pattern)?.[0] ?? [])
}

// The listing describes what boardly.online offers, and production never promotes an
// in-development game, whatever ENABLE_* says in the shell or .env.local.
function productionGameIds(): string[] {
  const touched = Object.keys(process.env).filter((key) => /^(NEXT_PUBLIC_)?ENABLE_|^(NEXT_PUBLIC_)?VERCEL_ENV$/.test(key))
  const saved = Object.fromEntries(touched.map((key) => [key, process.env[key]]))
  try {
    for (const key of touched) delete process.env[key]
    process.env.VERCEL_ENV = 'production'
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'production'
    return getCatalogAvailableGames().map((game) => game.id)
  } finally {
    delete process.env.VERCEL_ENV
    delete process.env.NEXT_PUBLIC_VERCEL_ENV
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value
    }
  }
}

describe('android/listing/listing.json (#1468)', () => {
  it('is for the app in twa-manifest.json', () => {
    expect(listingFile.packageName).toBe(twaManifest.packageId)
  })

  it('covers exactly the six languages, under the codes Play Console uses', () => {
    expect([...listingFile.languages].sort()).toEqual([...PLAY_LANGUAGES].sort())
    expect(Object.keys(listingFile.listings).sort()).toEqual([...PLAY_LANGUAGES].sort())
    expect(Object.keys(listingFile.releaseNotes['1.0.0']).sort()).toEqual([...PLAY_LANGUAGES].sort())
  })

  it('release notes are for the version in twa-manifest.json', () => {
    expect(Object.keys(listingFile.releaseNotes)).toContain(twaManifest.appVersion)
  })

  describe.each(PLAY_LANGUAGES)('%s', (language) => {
    const listing = listingFile.listings[language]

    it('keeps within the Play Console limits', () => {
      expect(length(listing.title)).toBeLessThanOrEqual(30)
      expect(length(listing.shortDescription)).toBeLessThanOrEqual(80)
      expect(length(listing.fullDescription)).toBeLessThanOrEqual(4000)
      expect(length(listingFile.releaseNotes['1.0.0'][language])).toBeLessThanOrEqual(500)
    })

    it('starts the title with the app name', () => {
      expect(listing.title.startsWith('Boardly')).toBe(true)
    })

    it('names no price, purchase, plan or upgrade', () => {
      const patterns = [...COMMERCE_EVERYWHERE, ...COMMERCE_BY_LANGUAGE[language]]
      for (const [field, text] of textsOf(language)) {
        expect({ field, found: matchesOf(text, patterns) }).toEqual({ field, found: [] })
      }
    })

    it('makes no ranking claim', () => {
      const patterns = [/#\s?1\b/, ...RANKING_BY_LANGUAGE[language]]
      for (const [field, text] of textsOf(language)) {
        expect({ field, found: matchesOf(text, patterns) }).toEqual({ field, found: [] })
      }
    })

    it('uses no other brand or trademark', () => {
      for (const [field, text] of textsOf(language)) {
        expect({ field, found: matchesOf(text, OTHER_BRANDS) }).toEqual({ field, found: [] })
      }
    })

    it('has no emoji, ALL-CAPS words or repeated punctuation', () => {
      const patterns = [
        /\p{Extended_Pictographic}/u,
        /(?<![\p{L}\p{N}])\p{Lu}{4,}(?![\p{L}\p{N}])/u,
        /([!?.*#~=_])\1+/,
      ]
      for (const [field, text] of textsOf(language)) {
        expect({ field, found: matchesOf(text, patterns) }).toEqual({ field, found: [] })
      }
    })

    it('names every game boardly.online offers, in the full description and the release notes', () => {
      const ids = productionGameIds()
      expect(Object.keys(listing.gameNames).sort()).toEqual([...ids].sort())
      for (const id of ids) {
        const name = listing.gameNames[id]
        expect({ id, inDescription: listing.fullDescription.includes(name) }).toEqual({ id, inDescription: true })
        expect({ id, inNotes: listingFile.releaseNotes['1.0.0'][language].includes(name) }).toEqual({
          id,
          inNotes: true,
        })
      }
    })
  })
})

describe('android/listing/store-settings.md (#1468)', () => {
  it('carries the same 1.0.0 release notes as listing.json, in Play Console paste format', () => {
    const blocks = Object.fromEntries(
      [...storeSettings.matchAll(/^<([a-zA-Z-]+)>\n([\s\S]*?)\n<\/\1>$/gm)].map((match) => [match[1], match[2]]),
    )
    expect(blocks).toEqual(listingFile.releaseNotes['1.0.0'])
  })
})
