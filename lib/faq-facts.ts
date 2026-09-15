import {
  getCatalogAvailableGames,
  getGameMetadata,
  hasBotSupport,
  type GameCatalogEntry,
} from './game-catalog'
import { PREMIUM_BASE_PRICE } from './stripe'

/**
 * One available game, as the home page FAQ needs it. `nameKey` renders in the
 * visitor's language; `nameEn` feeds the JSON-LD, which stays English for SEO
 * whatever the visitor's language is.
 */
export type FaqGame = { nameKey: string; nameEn: string }

/**
 * Everything in the FAQ that can go stale, read off the catalog instead of
 * written into the copy (#878). The hand-written version named five games,
 * still called Alias "in development" four months after it shipped, and
 * promised "no subscriptions, no ads, and no paywalls" while Premium was live.
 */
export type FaqFacts = {
  games: FaqGame[]
  botGames: FaqGame[]
  maxPlayers: number
  maxPlayersGame: FaqGame
  /**
   * Base price only — Adaptive Pricing decides the real amount per customer, so
   * q1 in every locale renders it behind a "from" (#919).
   */
  premiumPrice: string
}

function toFaqGame(game: GameCatalogEntry): FaqGame | null {
  if (!game.gameType) return null
  const meta = getGameMetadata(game.gameType)
  if (!meta) return null
  return { nameKey: game.nameKey, nameEn: meta.name }
}

export function buildFaqFacts(): FaqFacts {
  const availableGames = getCatalogAvailableGames()
  const games = availableGames.map(toFaqGame).filter((game): game is FaqGame => game !== null)
  const botGames = availableGames
    .filter((game) => game.gameType && hasBotSupport(game.gameType))
    .map(toFaqGame)
    .filter((game): game is FaqGame => game !== null)

  const biggest = availableGames.reduce<{ game: FaqGame; max: number } | null>((best, entry) => {
    const faqGame = toFaqGame(entry)
    if (!faqGame || !entry.gameType) return best
    const max = getGameMetadata(entry.gameType)?.maxPlayers ?? 0
    return !best || max > best.max ? { game: faqGame, max } : best
  }, null)

  return {
    games,
    botGames,
    maxPlayers: biggest?.max ?? 0,
    // games is never empty — the six original games are always available
    maxPlayersGame: biggest?.game ?? games[0],
    premiumPrice: PREMIUM_BASE_PRICE,
  }
}
