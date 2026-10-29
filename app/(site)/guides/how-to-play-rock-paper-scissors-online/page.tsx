import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('how-to-play-rock-paper-scissors-online')

export default function HowToPlayRockPaperScissorsGuide() {
  return <GuidePage guide={guide} locale="en" />
}
