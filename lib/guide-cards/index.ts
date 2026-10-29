import { getGuideBySlug, type LocalizedGuideCard } from '@/lib/guides-catalog'
import type { PrefixedLocale, SeoLocale } from '@/lib/seo-locales'
import no from './no'
import ru from './ru'
import uk from './uk'

/**
 * The guides as the index and the home page list them, per language. Kept apart from the guide
 * text so the home page's client bundle carries ten titles, not ten articles.
 */
const CARDS: Record<PrefixedLocale, Record<string, LocalizedGuideCard>> = { ru, uk, no }

export function getGuideCard(slug: string, locale: SeoLocale): LocalizedGuideCard {
  if (locale === 'en') {
    const { title, description, readTime, published, updated } = getGuideBySlug(slug)
    return { title, description, readTime, published, updated }
  }
  const card = CARDS[locale][slug]
  if (!card) throw new Error(`Guide "${slug}" has no ${locale} card in lib/guide-cards/${locale}.ts`)
  return card
}

/** The newest translation date, for the index pages that list them. */
export function latestGuideTranslation(): string {
  return Object.values(CARDS)
    .flatMap((cards) => Object.values(cards).map((card) => card.updated))
    .reduce((newest, date) => (date > newest ? date : newest))
}
