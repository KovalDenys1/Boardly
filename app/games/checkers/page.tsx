import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import CheckersDetailContent from './CheckersDetailContent'

/**
 * Noindex while Checkers is in-development (#1083): the page exists and carries
 * its canonical, and releasing the game – a separate decision – flips this and
 * adds it to the sitemap in the same change, the way #873 did for Sketch & Guess.
 */
export const metadata: Metadata = buildGameMetadata('checkers', { index: false })

export default function CheckersPage() {
  return (
    <>
      <GameJsonLd gameId="checkers" />
      <CheckersDetailContent />
    </>
  )
}
