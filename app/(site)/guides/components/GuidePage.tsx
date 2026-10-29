import { buildGuideArticleJsonLd, buildGuideBreadcrumbJsonLd } from '@/lib/guide-seo'
import { localizeHref } from '@/lib/seo-locales'
import GuideLayout, { GuideFaqList, GuideSection, buildGuideFaqJsonLd } from './GuideLayout'
import type { RegisteredGuide } from './guide-definition'

/**
 * A guide page in one language. The FAQ section and its FAQPage node are both drawn from the
 * copy's one `faq` array, so the schema can never carry a question the page does not show.
 */
export default function GuidePage({ guide, locale }: { guide: RegisteredGuide; locale: 'en' }) {
  const copy = guide.copy[locale]
  const href = (path: string) => localizeHref(path, locale)
  const jsonLd = [
    buildGuideArticleJsonLd(guide.slug),
    buildGuideBreadcrumbJsonLd(guide.slug),
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
