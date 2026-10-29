import GuidesIndex, { guidesIndexMetadata } from '@/app/(site)/guides/components/GuidesIndex'

export const metadata = guidesIndexMetadata('ru')

export default function RuGuidesPage() {
  return <GuidesIndex locale="ru" />
}
