import { buildGuideArticleJsonLd, buildGuideBreadcrumbJsonLd, type GuideTranslation } from '@/lib/guide-seo'
import { getGuideBySlug } from '@/lib/guides-catalog'
import { localizeHref, type SeoLocale } from '@/lib/seo-locales'
import GuideLayout, { GuideFaqList, GuideSection, buildGuideFaqJsonLd } from './GuideLayout'
import type { RegisteredGuide } from './guide-definition'

/** The translation's `<head>` copy, or nothing for the English guide, whose copy is in the catalog. */
export function guideTranslation(guide: RegisteredGuide, locale: SeoLocale): GuideTranslation | undefined {
  return locale === 'en' ? undefined : { locale, seo: guide.copy[locale].seo }
}

/**
 * A guide page in one language. The FAQ section and its FAQPage node are both drawn from the
 * copy's one `faq` array, so the schema can never carry a question the page does not show.
 */
export default function GuidePage({ guide, locale }: { guide: RegisteredGuide; locale: SeoLocale }) {
  const copy = guide.copy[locale]
  const translation = guideTranslation(guide, locale)
  const href = (path: string) => localizeHref(path, locale)
  const jsonLd = [
    buildGuideArticleJsonLd(guide.slug, translation),
    buildGuideBreadcrumbJsonLd(guide.slug, translation),
    buildGuideFaqJsonLd(copy.faq),
  ]

  return (
    <>
      {jsonLd.map((node) => (
        <script key={String(node['@type'])} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }} />
      ))}

      <GuideLayout
        icon={guide.icon}
        slug={guide.slug}
        locale={locale}
        breadcrumbLabel={(translation?.seo ?? getGuideBySlug(guide.slug).seo).breadcrumbLabel}
        title={copy.title}
        subtitle={copy.subtitle}
        question={copy.question}
        answer={copy.answer}
        accentColor={guide.accentColor}
        cta={{ href: href(guide.ctaHref), label: copy.cta.label, detail: copy.cta.detail }}
        related={copy.related.map((link) => ({ href: href(link.href), label: link.label }))}
      >
        {guide.renderBody(locale)}

        <GuideSection title={copy.faqTitle}>
          <GuideFaqList items={copy.faq} />
        </GuideSection>
      </GuideLayout>
    </>
  )
}
