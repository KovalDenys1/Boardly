import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render } from '@testing-library/react'
import { metadata } from '@/app/layout'
import FaqSection from '@/components/HomePage/FaqSection'
import { buildFaqFacts } from '@/lib/faq-facts'
import {
  LOGO_HEIGHT,
  LOGO_URL,
  LOGO_WIDTH,
  ORGANIZATION_ID,
  WEBSITE_ID,
  organizationNode,
  siteJsonLd,
  websiteNode,
} from '@/lib/organization-json-ld'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

// The layout is imported for its `metadata` only. Its announcement banner
// reaches Prisma at module load, which needs a database this test does not.
jest.mock('@/components/AnnouncementBanner', () => ({
  __esModule: true,
  AnnouncementBanner: () => null,
}))

// Resolve keys against the real English locale so the FAQ test reads the
// visible answer, not a key echo.
jest.mock('@/lib/i18n-helpers', () => {
  const english = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, string | number>) => {
        const raw = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], english)
        const text = typeof raw === 'string' ? raw : key
        return vars
          ? text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
              name in vars ? String(vars[name]) : whole
            )
          : text
      },
    }),
  }
})

// Google truncates a desktop snippet around here. A description that is cut
// before it has named the brand cannot do the job this ticket gives it.
const SNIPPET_LIMIT = 160

describe('home metadata (#886)', () => {
  const title = (metadata.title as { default: string }).default

  it('names the brand before the category in the title', () => {
    expect(title.startsWith('Boardly')).toBe(true)
    expect(title).toBe('Boardly – Free Online Board Games with Friends')
    expect(title).not.toContain('—')
  })

  it('identifies the site by brand and domain inside the snippet Google renders', () => {
    const description = metadata.description ?? ''
    expect(description).toMatch(/^Boardly \(boardly\.online\)/)
    expect(description.length).toBeLessThanOrEqual(SNIPPET_LIMIT)
  })

  it('says the same thing in the Open Graph and X cards', () => {
    expect(metadata.openGraph?.title).toBe(title)
    expect((metadata.twitter as { title?: string })?.title).toBe(title)
    for (const description of [metadata.openGraph?.description, (metadata.twitter as { description?: string })?.description]) {
      expect(description).toMatch(/^Boardly \(boardly\.online\)/)
      expect((description ?? '').length).toBeLessThanOrEqual(SNIPPET_LIMIT)
    }
  })

  it('claims no X handle, because none of them is ours', () => {
    expect((metadata.twitter as { creator?: string })?.creator).toBeUndefined()
    expect(readFileSync(path.join(process.cwd(), 'app/layout.tsx'), 'utf8')).not.toContain("'@boardly'")
  })
})

describe('site JSON-LD graph (#886)', () => {
  const graph = siteJsonLd['@graph'] as readonly Record<string, unknown>[]
  const website = graph.find((node) => node['@type'] === 'WebSite')
  const organization = graph.find((node) => node['@type'] === 'Organization')

  it('publishes the WebSite and the Organization as siblings under one @context', () => {
    expect(siteJsonLd['@context']).toBe('https://schema.org')
    expect(graph).toHaveLength(2)
    expect(website).toBe(websiteNode)
    expect(organization).toBe(organizationNode)
  })

  it('gives the WebSite an @id and resolves its publisher inside the same graph', () => {
    expect(website?.['@id']).toBe(WEBSITE_ID)
    expect(website?.publisher).toEqual({ '@id': ORGANIZATION_ID })
    expect(graph.some((node) => node['@id'] === ORGANIZATION_ID)).toBe(true)
  })

  it('carries the two-word brand as an alternateName on both nodes', () => {
    expect(website?.alternateName).toBe('Boardly Games')
    expect(organization?.alternateName).toBe('Boardly Games')
    expect(website?.name).toBe('Boardly')
  })

  it('declares the four languages the site is actually served in', () => {
    expect(website?.inLanguage).toEqual(['en', 'no', 'ru', 'uk'])
  })

  it('has no SearchAction – Google retired the sitelinks search box', () => {
    expect(JSON.stringify(siteJsonLd)).not.toContain('potentialAction')
    expect(JSON.stringify(siteJsonLd)).not.toContain('SearchAction')
  })

  it('states the logo dimensions the file on disk actually has', () => {
    const png = readFileSync(path.join(process.cwd(), 'public/brand/logo.png'))
    // PNG IHDR: 8-byte signature, 4-byte length, 4-byte type, then width/height.
    expect(png.readUInt32BE(16)).toBe(LOGO_WIDTH)
    expect(png.readUInt32BE(20)).toBe(LOGO_HEIGHT)
    expect(organizationNode.logo).toEqual({
      '@type': 'ImageObject',
      url: LOGO_URL,
      width: LOGO_WIDTH,
      height: LOGO_HEIGHT,
    })
  })

  it('names only profiles Boardly controls in sameAs', () => {
    // The repo plus every account in lib/social-profiles.ts (#1091) – the list is
    // derived there, so a profile added to that file shows up here by design.
    const { SOCIAL_PROFILES } = jest.requireActual('@/lib/social-profiles')
    expect(organizationNode.sameAs).toEqual([
      'https://github.com/KovalDenys1/Boardly',
      ...SOCIAL_PROFILES.map((profile: { url: string }) => profile.url),
    ])
  })
})

describe('home FAQ entity answer (#886)', () => {
  it('asks what Boardly is first, in all four locales', () => {
    for (const locale of [en, no, ru, uk]) {
      expect(locale.faq.q0.question).toContain('Boardly')
      expect(locale.faq.q0.answer).toContain('boardly.online')
      expect(Object.keys(locale.faq)[Object.keys(locale.faq).indexOf('q0')]).toBe('q0')
      expect(Object.keys(locale.faq).indexOf('q0')).toBeLessThan(Object.keys(locale.faq).indexOf('q1'))
    }
  })

  it('renders it as the first visible question and in the FAQPage JSON-LD', () => {
    const { container } = render(<FaqSection facts={buildFaqFacts()} />)

    const firstQuestion = container.querySelector('.home-faq-item dt')?.textContent ?? ''
    expect(firstQuestion).toContain(en.faq.q0.question)

    const script = container.querySelector('script[type="application/ld+json"]')
    const jsonLd = JSON.parse(script?.textContent ?? '{}')
    expect(jsonLd['@type']).toBe('FAQPage')
    expect(jsonLd.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: en.faq.q0.question,
      acceptedAnswer: { '@type': 'Answer', text: en.faq.q0.answer },
    })
  })

  it('does not put brand misspellings on the page', () => {
    for (const locale of [en, no, ru, uk]) {
      const text = JSON.stringify(locale.faq).toLowerCase()
      for (const misspelling of ['boordly', 'borderly', 'boardle ', 'boardlify']) {
        expect(text).not.toContain(misspelling)
      }
    }
  })
})
