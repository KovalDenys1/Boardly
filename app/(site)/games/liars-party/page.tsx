import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import LiarsPartyDetailContent from './LiarsPartyDetailContent'

/**
 * `metadata` stays server-side and stays English on purpose - see the note in
 * app/games/alias/page.tsx. Localized titles are #928's job.
 */
export const metadata: Metadata = buildGameMetadata('liars-party')

export default function LiarsPartyGamePage() {
  return (
    <>
      <GameJsonLd gameId="liars-party" />
      <LiarsPartyDetailContent />
    </>
  )
}
