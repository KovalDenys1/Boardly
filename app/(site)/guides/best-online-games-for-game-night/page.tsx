import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('best-online-games-for-game-night')

export default function BestOnlineGamesForGameNightGuide() {
  return <GuidePage guide={guide} locale="en" />
}
