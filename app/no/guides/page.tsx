import GuidesIndex, { guidesIndexMetadata } from '@/app/(site)/guides/components/GuidesIndex'

export const metadata = guidesIndexMetadata('no')

export default function NoGuidesPage() {
  return <GuidesIndex locale="no" />
}
