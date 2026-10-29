import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import MemoryDetailContent from './MemoryDetailContent'

export const metadata: Metadata = buildGameMetadata('memory')

export default function MemoryPage() {
  return (
    <>
      <GameJsonLd gameId="memory" />
      <MemoryDetailContent />
    </>
  )
}
