import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import YahtzeeDetailContent from './YahtzeeDetailContent'

export const metadata: Metadata = buildGameMetadata('yahtzee')

export default function YahtzeePage() {
  return (
    <>
      <GameJsonLd gameId="yahtzee" />
      <YahtzeeDetailContent />
    </>
  )
}
