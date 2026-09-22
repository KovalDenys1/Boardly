import { ALL_GUIDES } from '@/lib/guides-catalog'
import {
  buildGuideArticleJsonLd,
  buildGuideBreadcrumbJsonLd,
  buildGuideMetadata,
  getGuideCanonical,
} from '@/lib/guide-seo'
import { ORGANIZATION_ID, siteJsonLd } from '@/lib/organization-json-ld'

const BASE = 'https://boardly.online'

/**
 * #1065. Twelve guides hand-wrote their own head: none carried a Twitter card,
 * four claimed `datePublished: '2025-01-01'` – a date before the site existed –
 * and each repeated its canonical URL in the metadata, the Article node and the
 * breadcrumb, where they could disagree. The head is derived from the catalog
 * now, and these are the properties that made the hand-written version wrong.
 */
describe('buildGuideMetadata', () => {
  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s carries a Twitter card', (slug) => {
    const twitter = buildGuideMetadata(slug).twitter as { card?: string; title?: string; description?: string }
    expect(twitter.card).toBe('summary_large_image')
    expect(twitter.title).toContain('| Boardly')
    expect(twitter.description?.length ?? 0).toBeGreaterThan(20)
  })

  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s canonicals to its own slug, once', (slug) => {
    const metadata = buildGuideMetadata(slug)
    const url = `${BASE}/guides/${slug}`

    expect(metadata.alternates?.canonical).toBe(url)
    expect(getGuideCanonical(slug)).toBe(url)
    expect((metadata.openGraph as { url?: string }).url).toBe(url)
    expect(buildGuideArticleJsonLd(slug).url).toBe(url)
  })

  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s is indexable and dated from the catalog', (slug) => {
    const guide = ALL_GUIDES.find((entry) => entry.slug === slug)!
    const metadata = buildGuideMetadata(slug)
    const og = metadata.openGraph as { type?: string; publishedTime?: string; modifiedTime?: string }

    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(og.type).toBe('article')
    expect(og.publishedTime).toBe(guide.published)
    expect(og.modifiedTime).toBe(guide.updated)
  })

  it('gives every guide a distinct title and a description search results can show', () => {
    const titles = ALL_GUIDES.map((guide) => guide.seo.title)
    expect(new Set(titles).size).toBe(titles.length)

    for (const guide of ALL_GUIDES) {
      expect(guide.seo.description.length).toBeGreaterThanOrEqual(80)
      expect(guide.seo.keywords.length).toBeGreaterThanOrEqual(5)
      // lowercase, so two spellings of one query cannot both be claimed
      for (const keyword of guide.seo.keywords) expect(keyword).toBe(keyword.toLowerCase())
    }
  })
})

describe('buildGuideArticleJsonLd', () => {
  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s names the Organization by @id, not a second copy', (slug) => {
    const article = buildGuideArticleJsonLd(slug)

    expect(article.author).toEqual({ '@id': ORGANIZATION_ID })
    expect(article.publisher).toEqual({ '@id': ORGANIZATION_ID })
    expect(JSON.stringify(article)).not.toContain('"@type":"Organization"')
  })

  it('references an @id the root layout actually defines on the same page', () => {
    // A reference by @id is only better than an inline copy while the node it
    // names is on the page. The layout embeds `siteJsonLd` everywhere, so this
    // is what makes the guides' author/publisher resolvable rather than dangling.
    expect(siteJsonLd['@graph'].map((node) => node['@id'])).toContain(ORGANIZATION_ID)
  })
})

describe('buildGuideBreadcrumbJsonLd', () => {
  it.each(ALL_GUIDES.map((guide) => guide.slug))('%s ends on the crumb the page draws', (slug) => {
    const guide = ALL_GUIDES.find((entry) => entry.slug === slug)!
    const crumbs = buildGuideBreadcrumbJsonLd(slug).itemListElement as { position: number; name: string; item: string }[]

    expect(crumbs.map((crumb) => crumb.position)).toEqual([1, 2, 3])
    expect(crumbs[2].name).toBe(guide.seo.breadcrumbLabel)
    expect(crumbs[2].item).toBe(`${BASE}/guides/${slug}`)
  })
})
