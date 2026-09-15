import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import ConnectFourDetailContent from './ConnectFourDetailContent'

export const metadata: Metadata = buildGameMetadata('connect-four')

export default function ConnectFourPage() {
  return (
    <>
      <GameJsonLd gameId="connect-four" />
      <ConnectFourDetailContent />
    </>
  )
}
