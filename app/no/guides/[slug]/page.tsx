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
  return localizedGuideMetadata('no', (await params).slug)
}

export default async function NoGuidePage({ params }: LocalizedGuideParams) {
  return <LocalizedGuidePage locale="no" slug={(await params).slug} />
}
