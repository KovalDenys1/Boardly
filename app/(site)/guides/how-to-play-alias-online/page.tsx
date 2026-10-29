import type { Metadata } from 'next'
import { buildGuideMetadata } from '@/lib/guide-seo'
import GuidePage from '../components/GuidePage'
import guide from './guide'

export const metadata: Metadata = buildGuideMetadata('how-to-play-alias-online')

export default function HowToPlayAliasGuide() {
  return <GuidePage guide={guide} locale="en" />
}
