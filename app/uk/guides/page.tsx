import GuidesIndex, { guidesIndexMetadata } from '@/app/(site)/guides/components/GuidesIndex'

export const metadata = guidesIndexMetadata('uk')

export default function UkGuidesPage() {
  return <GuidesIndex locale="uk" />
}
