import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import SketchAndGuessDetailContent from './SketchAndGuessDetailContent'

/**
 * `index: false` for as long as the catalog entry is in-development, which is
 * how `/games/liars-party` has shipped since #872: the page exists, carries its
 * canonical and is linked from nowhere Google crawls. #873 is the ticket that
 * makes it indexable, together with the `availability` flip and the sitemap
 * entry – not this one.
 *
 * Nothing here reads the session or the database, so the route stays in the
 * prerendered set with every other `/games/<slug>` page.
 */
export const metadata: Metadata = buildGameMetadata('guess-my-drawing', { index: false })

export default function SketchAndGuessPage() {
  return (
    <>
      <GameJsonLd gameId="guess-my-drawing" />
      <SketchAndGuessDetailContent />
    </>
  )
}
