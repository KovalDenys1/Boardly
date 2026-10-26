import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import TicTacToeDetailContent from './TicTacToeDetailContent'

export const metadata: Metadata = buildGameMetadata('tic-tac-toe')

export default function TicTacToePage() {
  return (
    <>
      <GameJsonLd gameId="tic-tac-toe" />
      <TicTacToeDetailContent />
    </>
  )
}
