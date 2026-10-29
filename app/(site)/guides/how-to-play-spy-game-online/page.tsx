import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('how-to-play-spy-game-online')

export default function HowToPlaySpyGuide() {
  return <GuidePage guide={guide} locale="en" />
}
