import { buildGameJsonLd } from '@/lib/game-seo'
import type { SeoLocale } from '@/lib/seo-locales'

/**
 * Every `/games/<game>` page's structured data, built from the game's catalog
 * entry (#929). A server component on purpose – the scripts belong in the
 * prerendered HTML, which is what a crawler reads.
 */
export default function GameJsonLd({ gameId, locale }: { gameId: string; locale?: SeoLocale }) {
  return (
    <>
      {buildGameJsonLd(gameId, locale).map((schema) => (
        <script
          key={schema['@type'] as string}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  )
}
