import { buildGameJsonLd } from '@/lib/game-seo'

/**
 * Every `/games/<game>` page's structured data, built from the game's catalog
 * entry (#929). A server component on purpose – the scripts belong in the
 * prerendered HTML, which is what a crawler reads.
 */
export default function GameJsonLd({ gameId }: { gameId: string }) {
  return (
    <>
      {buildGameJsonLd(gameId).map((schema) => (
        <script
          key={schema['@type'] as string}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  )
}
