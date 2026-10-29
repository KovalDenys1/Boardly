import type { Metadata } from 'next'
import GuidesIndex, { guidesIndexMetadata } from './components/GuidesIndex'

export const metadata: Metadata = guidesIndexMetadata('en')

export default function GuidesPage() {
  return <GuidesIndex locale="en" />
}
