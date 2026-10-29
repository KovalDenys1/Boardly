import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ReactElement } from 'react'
import type { Metadata } from 'next'
import { render } from '@testing-library/react'

import { GUIDE_PAGES } from '@/app/(site)/guides/components/guide-registry'
import { guideLinks } from '@/app/(site)/guides/components/GuideRich'
import { getGuideCard } from '@/lib/guide-cards'
import { buildGuideMetadata } from '@/lib/guide-seo'
import { ALL_GUIDES, getGuideGamePath } from '@/lib/guides-catalog'
import {
  HREFLANG,
  OG_LOCALES,
  isLocalizedPage,
  languageAlternates,
  pathLocale,
  unlocalizedPath,
} from '@/lib/seo-locales'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

jest.mock('@/components/AdSlot', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))
jest.mock('next/font/google', () => ({
  Bricolage_Grotesque: () => ({ variable: '--bd-font-display', className: '' }),
  Inter: () => ({ className: '' }),
}))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/components/AnnouncementBanner', () => ({ AnnouncementBanner: () => null }))
jest.mock('@/app/providers', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => children }))

const BASE = 'https://boardly.online'
const LOCALES = ['ru', 'uk', 'no'] as const
type Locale = (typeof LOCALES)[number]
const SITE_TEXT = { ru, uk, no }

const trees = {
  ru: { layout: require('@/app/ru/layout'), index: require('@/app/ru/guides/page'), guide: require('@/app/ru/guides/[slug]/page') },
  uk: { layout: require('@/app/uk/layout'), index: require('@/app/uk/guides/page'), guide: require('@/app/uk/guides/[slug]/page') },
  no: { layout: require('@/app/no/layout'), index: require('@/app/no/guides/page'), guide: require('@/app/no/guides/[slug]/page') },
}
const englishIndex = require('@/app/(site)/guides/page')
const sitemap = require('@/app/sitemap').default

const slugs = ALL_GUIDES.map((guide) => guide.slug)
const cases = LOCALES.flatMap((locale) => slugs.map((slug) => [locale, slug] as const))
const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

/** Letters only one of the languages has, so a page in the wrong one, or half in English, shows. */
const SCRIPT: Record<Locale, { must: RegExp; mustNot: RegExp }> = {
  ru: { must: /[ыэъё]/i, mustNot: /[іїєґ]/i },
  uk: { must: /[іїєґ]/i, mustNot: /[ыэъё]/i },
  no: { must: /[æøå]/i, mustNot: /[а-яё]/i },
}
const ENGLISH_CHROME = ['Last updated', 'More guides', 'Rules, modes and player counts', 'Or read about', 'How to Play']

function visibleText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script').forEach((script) => script.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function jsonLd(container: HTMLElement): Record<string, unknown>[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((script) =>
    JSON.parse(script.textContent ?? '{}')
  )
}

const hrefs = (container: HTMLElement) => Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')

async function renderGuide(locale: Locale, slug: string) {
  const element: ReactElement = await trees[locale].guide.default(params(slug))
  return render(element).container
}

describe('every guide in /ru, /uk and /no (#1583)', () => {
  it('builds every guide slug, and only those, under each prefix', () => {
    for (const locale of LOCALES) {
      const built = (trees[locale].guide.generateStaticParams() as { slug: string }[]).map((p) => p.slug)
      expect([...built].sort()).toEqual([...slugs].sort())
      expect(trees[locale].guide.dynamicParams).toBe(false)
      expect(existsSync(path.join(process.cwd(), 'app', locale, 'guides', '[slug]', 'page.tsx'))).toBe(true)
    }
    expect(Object.keys(GUIDE_PAGES).sort()).toEqual([...slugs].sort())
  })

  it('serves them under the root layout whose <html lang> is the hreflang code, nb for Norwegian', () => {
    for (const locale of LOCALES) {
      expect(trees[locale].layout.default({ children: null }).props).toMatchObject({ lang: HREFLANG[locale] })
    }
  })

  it.each(cases)('/%s/guides/%s is written in its language, chrome included', async (locale, slug) => {
    const container = await renderGuide(locale, slug)
    const text = visibleText(container)

    expect(container.querySelector('h1')?.textContent).toBe(GUIDE_PAGES[slug].copy[locale].title)
    expect(text).toMatch(SCRIPT[locale].must)
    expect(text).not.toMatch(SCRIPT[locale].mustNot)
    for (const english of ENGLISH_CHROME) expect(text).not.toContain(english)

    const crumbs = container.querySelector(`nav[aria-label="${SITE_TEXT[locale].breadcrumbs.label}"]`)?.textContent ?? ''
    expect(crumbs).toContain(SITE_TEXT[locale].breadcrumbs.home)
    expect(crumbs).toContain(SITE_TEXT[locale].header.guides)
  })

  it.each(cases)('/%s/guides/%s says in its structured data which language it is and where', async (locale, slug) => {
    const container = await renderGuide(locale, slug)
    const nodes = jsonLd(container)
    const url = `${BASE}/${locale}/guides/${slug}`

    const article = nodes.find((node) => node['@type'] === 'Article')
    expect(article).toMatchObject({
      inLanguage: HREFLANG[locale],
      url,
      headline: GUIDE_PAGES[slug].copy[locale].seo.headline,
      datePublished: getGuideCard(slug, locale).published,
      dateModified: getGuideCard(slug, locale).updated,
    })

    const crumbs = nodes.find((node) => node['@type'] === 'BreadcrumbList') as {
      itemListElement: { item: string; name: string }[]
    }
    expect(crumbs.itemListElement.map((item) => item.item)).toEqual([`${BASE}/${locale}`, `${BASE}/${locale}/guides`, url])

    const faq = nodes.find((node) => node['@type'] === 'FAQPage') as { mainEntity: { name: string }[] }
    const shown = Array.from(container.querySelectorAll('[data-testid="guide-faq-question"]')).map((h) => h.textContent)
    expect(faq.mainEntity.map((entry) => entry.name)).toEqual(shown)
  })

  it.each(cases)('/%s/guides/%s links pages in its own language wherever one exists', async (locale, slug) => {
    const container = await renderGuide(locale, slug)
    const internal = hrefs(container).filter((href) => href.startsWith('/'))
    expect(internal.length).toBeGreaterThan(0)

    for (const href of internal) {
      const pathname = href.split(/[?#]/)[0]
      const english = unlocalizedPath(pathname)
      expect({ href, locale: isLocalizedPage(english) ? pathLocale(pathname) : 'en' }).toEqual({
        href,
        locale: isLocalizedPage(english) ? locale : 'en',
      })
    }

    const gamePath = getGuideGamePath(ALL_GUIDES.find((guide) => guide.slug === slug)!)
    if (gamePath) expect(internal.filter((href) => href === `/${locale}${gamePath}`).length).toBeGreaterThanOrEqual(2)
  })
})

describe('metadata and hreflang of a guide (#1583)', () => {
  it.each(cases)('/%s/guides/%s names itself canonical, in its language, with the full hreflang set', async (locale, slug) => {
    const meta: Metadata = await trees[locale].guide.generateMetadata(params(slug))
    const seo = GUIDE_PAGES[slug].copy[locale].seo
    const url = `${BASE}/${locale}/guides/${slug}`

    expect(meta.title).toBe(seo.title)
    expect(meta.description).toBe(seo.description)
    expect(meta.alternates?.canonical).toBe(url)
    expect(meta.alternates?.languages).toEqual(languageAlternates(`/guides/${slug}`))
    expect(meta.openGraph).toMatchObject({ locale: OG_LOCALES[locale], url, type: 'article' })
    expect(meta.robots).toMatchObject({ index: true, follow: true })
  })

  it('publishes the same hreflang set from the English guide', () => {
    for (const slug of slugs) {
      expect(buildGuideMetadata(slug).alternates?.languages).toEqual(languageAlternates(`/guides/${slug}`))
    }
    expect(languageAlternates('/guides/how-to-play-yahtzee-online')).toEqual({
      en: `${BASE}/guides/how-to-play-yahtzee-online`,
      ru: `${BASE}/ru/guides/how-to-play-yahtzee-online`,
      uk: `${BASE}/uk/guides/how-to-play-yahtzee-online`,
      nb: `${BASE}/no/guides/how-to-play-yahtzee-online`,
      'x-default': `${BASE}/guides/how-to-play-yahtzee-online`,
    })
  })
})

describe('the guides index in each language (#1583)', () => {
  it.each(LOCALES)('/%s/guides lists every guide at its own-language URL', (locale) => {
    const Index = trees[locale].index.default
    const { container } = render(<Index />)
    const links = hrefs(container)

    for (const slug of slugs) expect(links).toContain(`/${locale}/guides/${slug}`)
    expect(links.filter((href) => /^\/guides\//.test(href))).toEqual([])
    for (const slug of slugs) expect(visibleText(container)).toContain(getGuideCard(slug, locale).title)

    const text = visibleText(container)
    expect(text).toMatch(SCRIPT[locale].must)
    for (const english of ENGLISH_CHROME) expect(text).not.toContain(english)
  })

  it.each(LOCALES)('/%s/guides names itself canonical with the full hreflang set', (locale) => {
    const meta: Metadata = trees[locale].index.metadata
    expect(meta.alternates?.canonical).toBe(`${BASE}/${locale}/guides`)
    expect(meta.alternates?.languages).toEqual(languageAlternates('/guides'))
    expect(meta.openGraph).toMatchObject({ locale: OG_LOCALES[locale], url: `${BASE}/${locale}/guides` })
    expect(meta.title).not.toEqual((englishIndex.metadata as Metadata).title)
    expect(meta.description).not.toEqual((englishIndex.metadata as Metadata).description)
  })

  it('gives the English index the same set', () => {
    expect((englishIndex.metadata as Metadata).alternates?.languages).toEqual(languageAlternates('/guides'))
  })
})

describe('sitemap (#1583)', () => {
  type Entry = { url: string; lastModified?: Date; alternates?: { languages?: Record<string, string> } }
  const entries: Entry[] = sitemap()
  const byUrl = new Map(entries.map((entry) => [entry.url, entry]))

  it('lists all four URLs of the index and of every guide, each with the full hreflang set', () => {
    for (const pathname of ['/guides', ...slugs.map((slug) => `/guides/${slug}`)]) {
      const set = languageAlternates(pathname)
      for (const url of new Set(Object.values(set))) expect(byUrl.get(url)?.alternates?.languages).toEqual(set)
    }
    expect(new Set(entries.map((entry) => entry.url)).size).toBe(entries.length)
  })

  it('dates each translated guide by its translation', () => {
    for (const [locale, slug] of cases) {
      expect(byUrl.get(`${BASE}/${locale}/guides/${slug}`)?.lastModified).toEqual(new Date(getGuideCard(slug, locale).updated))
    }
  })
})

describe('the translations keep the English facts (#1583)', () => {
  const numbers = (text: string): string[] => text.match(/\d+/g) ?? []
  const links = (text: string) => guideLinks(text).map((link) => link.href)

  /** Where a translation differs from the English in shape, links or numbers – empty when it does not. */
  function differences(english: unknown, translated: unknown, at: string): string[] {
    if (typeof english === 'string') {
      if (typeof translated !== 'string' || !translated.trim()) return [`${at}: missing`]
      if (at.endsWith('.href')) return translated === english ? [] : [`${at}: link changed`]
      const problems: string[] = []
      if (links(translated).join(' ') !== links(english).join(' ')) problems.push(`${at}: links differ`)
      const kept = numbers(translated)
      for (const number of numbers(english)) if (!kept.includes(number)) problems.push(`${at}: lost ${number}`)
      if (translated === english && english.split(/\s+/).filter((word) => /\p{L}{2}/u.test(word)).length >= 3) {
        problems.push(`${at}: left in English`)
      }
      return problems
    }
    if (Array.isArray(english)) {
      if (!Array.isArray(translated) || translated.length !== english.length) return [`${at}: ${english.length} items expected`]
      return english.flatMap((item, index) => differences(item, translated[index], `${at}[${index}]`))
    }
    const englishKeys = Object.keys(english as object).sort()
    const translatedKeys = Object.keys((translated ?? {}) as object).filter((key) => at || key !== 'seo').sort()
    if (englishKeys.join() !== translatedKeys.join()) return [`${at || 'copy'}: keys ${translatedKeys} expected ${englishKeys}`]
    return englishKeys.flatMap((key) =>
      differences((english as Record<string, unknown>)[key], (translated as Record<string, unknown>)[key], at ? `${at}.${key}` : key)
    )
  }

  it.each(cases)('%s %s has the English shape, links and numbers', (locale, slug) => {
    const { copy } = GUIDE_PAGES[slug]
    expect(differences(copy.en, copy[locale], '')).toEqual([])
  })

  it.each(cases)('%s %s asks its questions as questions and names related guides by their titles', (locale, slug) => {
    const copy = GUIDE_PAGES[slug].copy[locale]
    expect(copy.question).toMatch(/\?$/)
    expect(copy.answer.split(/\s+/).length).toBeGreaterThanOrEqual(12)
    for (const { question } of copy.faq) expect(question).toMatch(/\?$/)
    for (const { href, label } of copy.related) {
      expect({ href, label }).toEqual({ href, label: GUIDE_PAGES[href.replace('/guides/', '')].copy[locale].title })
    }
  })

  it.each(cases)('%s %s has a head a search result can show', (locale, slug) => {
    const { seo } = GUIDE_PAGES[slug].copy[locale]
    for (const value of Object.values(seo)) expect(value.trim()).not.toBe('')
    expect(seo.title.length).toBeLessThanOrEqual(70)
    expect(seo.description.length).toBeLessThanOrEqual(200)
  })

  it.each(cases)('%s %s is dated no earlier than the English it translates', (locale, slug) => {
    const card = getGuideCard(slug, locale)
    const english = ALL_GUIDES.find((guide) => guide.slug === slug)!
    expect(card.updated >= english.updated).toBe(true)
    expect(card.published <= card.updated).toBe(true)
    expect(card.published).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
