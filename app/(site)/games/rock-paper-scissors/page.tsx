import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import RockPaperScissorsDetailContent from './RockPaperScissorsDetailContent'

/**
 * `metadata` stays server-side and stays English on purpose - see the note in
 * app/games/alias/page.tsx. Localized titles are #928's job.
 */
export const metadata: Metadata = buildGameMetadata('rps')

export default function RockPaperScissorsGamePage() {
  return (
    <>
      <GameJsonLd gameId="rps" />
      <RockPaperScissorsDetailContent />
    </>
  )
}
