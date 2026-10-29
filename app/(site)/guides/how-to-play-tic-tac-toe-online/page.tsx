import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('how-to-play-tic-tac-toe-online')

export default function HowToPlayTicTacToeGuide() {
  return <GuidePage guide={guide} locale="en" />
}
