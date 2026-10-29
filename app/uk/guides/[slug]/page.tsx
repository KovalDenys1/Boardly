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
  return localizedGuideMetadata('uk', (await params).slug)
}

export default async function UkGuidePage({ params }: LocalizedGuideParams) {
  return <LocalizedGuidePage locale="uk" slug={(await params).slug} />
}
