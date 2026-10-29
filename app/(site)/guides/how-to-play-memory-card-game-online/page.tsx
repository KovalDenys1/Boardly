import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('how-to-play-memory-card-game-online')

export default function HowToPlayMemoryGuide() {
  return <GuidePage guide={guide} locale="en" />
}
