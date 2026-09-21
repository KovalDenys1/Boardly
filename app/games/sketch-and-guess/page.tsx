import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import SketchAndGuessDetailContent from './SketchAndGuessDetailContent'

/**
 * Indexable since #873, which flipped the catalog entry to `available` and put
 * the page in the sitemap in the same change. It had shipped noindex while the
 * game was in-development: the page existed, carried its canonical and was
 * linked from nowhere Google crawls.
 *
 * Nothing here reads the session or the database, so the route stays in the
 * prerendered set with every other `/games/<slug>` page.
 */
export const metadata: Metadata = buildGameMetadata('guess-my-drawing')

export default function SketchAndGuessPage() {
  return (
    <>
      <GameJsonLd gameId="guess-my-drawing" />
      <SketchAndGuessDetailContent />
    </>
  )
}
