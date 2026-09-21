import { buildFaqFacts } from '@/lib/faq-facts'
import { getCatalogAvailableGames, getGameMetadata, hasBotSupport } from '@/lib/game-catalog'
import { PREMIUM_BASE_PRICE } from '@/lib/stripe'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

describe('home page FAQ facts', () => {
  const facts = buildFaqFacts()
  const availableTypes = getCatalogAvailableGames().map((game) => game.gameType)

  it('names every available game and nothing else', () => {
    // #878: the hand-written FAQ listed five games and still called Alias
    // "in development" four months after it shipped.
    const expected = availableTypes.map((type) => getGameMetadata(type!)!.name)
    const named = facts.games.map((game) => game.nameEn)
    expect(named).toEqual(expected)
    // The two the old copy got wrong in both directions
    expect(named).toContain('Alias')
    expect(named).toContain('Rock Paper Scissors')
    // Released by #873, and the FAQ picked them up without anyone editing the
    // copy – which is what #878 was for.
    expect(named).toContain("Liar's Party")
    expect(named).toContain('Sketch & Guess')
    // Still unreleased – naming one here would be a promise the site cannot keep
    expect(named).not.toContain('Fake Artist')
    expect(named).not.toContain('Telephone Doodle')
  })

  it('names only the games that actually take bots', () => {
    const expected = availableTypes.filter((type) => hasBotSupport(type!)).map((type) => getGameMetadata(type!)!.name)
    expect(facts.botGames.map((game) => game.nameEn)).toEqual(expected)
    expect(facts.botGames.length).toBeLessThan(facts.games.length)
  })

  it('quotes the largest room any available game supports', () => {
    const maxima = availableTypes.map((type) => getGameMetadata(type!)!.maxPlayers)
    expect(facts.maxPlayers).toBe(Math.max(...maxima))
    expect(getGameMetadata(availableTypes.find((type) => getGameMetadata(type!)!.name === facts.maxPlayersGame.nameEn)!)!.maxPlayers).toBe(facts.maxPlayers)
  })

  it('carries the base price and leaves the phrasing to each locale', () => {
    // The old q1 said "no subscriptions, no ads, and no paywalls" while
    // Premium was live and the AdSense loader had shipped.
    expect(facts.premiumPrice).toBe(PREMIUM_BASE_PRICE)
    // #919: Adaptive Pricing charges each customer in their own currency, so
    // the figure is only a starting point. No locale may bake it into its own
    // copy, and none may drop the slot its "from …" wording hangs on.
    for (const locale of [en, no, ru, uk]) {
      expect(locale.faq.q1.answer).toContain('{{price}}')
      expect(locale.faq.q1.answer).not.toContain(PREMIUM_BASE_PRICE)
    }
  })

  it('gives every game a real translation key', () => {
    for (const game of [...facts.games, ...facts.botGames, facts.maxPlayersGame]) {
      expect(game.nameKey).toMatch(/^games\.[a-z_]+\.name$/)
    }
  })
})
