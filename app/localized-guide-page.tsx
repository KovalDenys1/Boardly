import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import GuidePage, { guideTranslation } from '@/app/(site)/guides/components/GuidePage'
import { GUIDE_PAGES } from '@/app/(site)/guides/components/guide-registry'
import { buildGuideMetadata } from '@/lib/guide-seo'
import type { PrefixedLocale } from '@/lib/seo-locales'

/** Every `/guides/<slug>` page, for `app/ru/guides/[slug]`, `app/uk/guides/[slug]` and `app/no/guides/[slug]`. */
export type LocalizedGuideParams = { params: Promise<{ slug: string }> }

export function localizedGuideParams(): { slug: string }[] {
  return Object.keys(GUIDE_PAGES).map((slug) => ({ slug }))
}

export function localizedGuideMetadata(locale: PrefixedLocale, slug: string): Metadata {
  const guide = GUIDE_PAGES[slug]
  if (!guide) notFound()
  return buildGuideMetadata(slug, guideTranslation(guide, locale))
}

export function LocalizedGuidePage({ locale, slug }: { locale: PrefixedLocale; slug: string }) {
  const guide = GUIDE_PAGES[slug]
  if (!guide) notFound()
  return <GuidePage guide={guide} locale={locale} />
}
