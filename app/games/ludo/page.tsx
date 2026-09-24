import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import LudoDetailContent from './LudoDetailContent'

// Out of the index while the game is in development (#1084); the flip that
// releases it drops the option, which __tests__/lib/game-seo.test.ts checks.
export const metadata: Metadata = buildGameMetadata('ludo', { index: false })

export default function LudoPage() {
  return (
    <>
      <GameJsonLd gameId="ludo" />
      <LudoDetailContent />
    </>
  )
}
