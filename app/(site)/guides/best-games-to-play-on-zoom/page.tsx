import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('best-games-to-play-on-zoom')

export default function BestGamesToPlayOnZoomGuide() {
  return <GuidePage guide={guide} locale="en" />
}
