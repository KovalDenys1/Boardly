import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import SpyDetailContent from './SpyDetailContent'

export const metadata: Metadata = buildGameMetadata('spy')

export default function SpyPage() {
  return (
    <>
      <GameJsonLd gameId="spy" />
      <SpyDetailContent />
    </>
  )
}
