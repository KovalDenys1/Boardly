import {
  LocalizedGuidePage,
  localizedGuideMetadata,
  localizedGuideParams,
  type LocalizedGuideParams,
} from '@/app/localized-guide-page'

export const dynamicParams = false

export function generateStaticParams() {
  return localizedGuideParams()
}

export async function generateMetadata({ params }: LocalizedGuideParams) {
  return localizedGuideMetadata('ru', (await params).slug)
}

export default async function RuGuidePage({ params }: LocalizedGuideParams) {
  return <LocalizedGuidePage locale="ru" slug={(await params).slug} />
}
