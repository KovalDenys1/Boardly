import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import CheckersDetailContent from './CheckersDetailContent'

/**
 * Indexable since the release that made Checkers public (Denys, 2026-09-24),
 * which flipped the catalog entry and put the page in the sitemap in the same
 * change, the way #873 did for Sketch & Guess.
 */
export const metadata: Metadata = buildGameMetadata('checkers')

export default function CheckersPage() {
  return (
    <>
      <GameJsonLd gameId="checkers" />
      <CheckersDetailContent />
    </>
  )
}
