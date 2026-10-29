import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('best-2-player-games-online')

export default function Best2PlayerGamesGuide() {
  return <GuidePage guide={guide} locale="en" />
}
