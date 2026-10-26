import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import LudoDetailContent from './LudoDetailContent'

// Indexable since the release that made Ludo public (Denys, 2026-09-24);
// __tests__/lib/game-seo.test.ts checks released pages carry no noindex.
export const metadata: Metadata = buildGameMetadata('ludo')

export default function LudoPage() {
  return (
    <>
      <GameJsonLd gameId="ludo" />
      <LudoDetailContent />
    </>
  )
}
