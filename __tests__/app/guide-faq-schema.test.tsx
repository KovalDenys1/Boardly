import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ComponentType } from 'react'
import { render } from '@testing-library/react'
import { ALL_GUIDES } from '@/lib/guides-catalog'

// The guide pages are static content, but the layout ends with an ad slot and
// the site footer, which want a session and a translation context they have no
// part in here.
jest.mock('@/components/AdSlot', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => null,
}))

const root = process.cwd()

const guideSlugs = readdirSync(path.join(root, 'app', 'guides'))
  .filter((entry) => entry !== 'components')
  .filter((entry) => statSync(path.join(root, 'app', 'guides', entry)).isDirectory())

const readGuide = (slug: string) => readFileSync(path.join(root, 'app', 'guides', slug, 'page.tsx'), 'utf8')

interface FaqNode {
  '@type': string
  mainEntity: { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[]
}

/**
 * What a visitor can read. The JSON-LD blocks are `<script>` children, so their
 * text is part of `textContent` too — leaving them in would make every "is this
 * answer on the page" assertion pass against the schema's own copy of it.
 */
function visibleText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script').forEach((script) => script.remove())
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function renderGuide(slug: string) {
  const Page = require(`../../app/guides/${slug}/page`).default as ComponentType
  const { container } = render(<Page />)
  const nodes = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (script) => JSON.parse(script.textContent ?? '{}') as { '@type': string },
  )
  return {
    faqNode: nodes.find((node) => node['@type'] === 'FAQPage') as FaqNode | undefined,
    text: visibleText(container),
  }
}

describe('guide FAQPage schema (#964)', () => {
  it('covers every guide directory, and every guide is in the catalog', () => {
    expect(guideSlugs.length).toBeGreaterThan(0)
    expect([...guideSlugs].sort()).toEqual([...ALL_GUIDES.map((guide) => guide.slug)].sort())
  })

  it.each(guideSlugs)('%s renders every question its FAQPage carries', (slug) => {
    const { faqNode, text } = renderGuide(slug)
    if (!faqNode) return

    const missing = faqNode.mainEntity
      .filter((entry) => !text.includes(entry.name.replace(/\s+/g, ' ').trim()))
      .map((entry) => entry.name)
    expect(missing).toEqual([])
  })

  it.each(guideSlugs)('%s renders every answer its FAQPage carries', (slug) => {
    const { faqNode, text } = renderGuide(slug)
    if (!faqNode) return

    const missing = faqNode.mainEntity
      .filter((entry) => !text.includes(entry.acceptedAnswer.text.replace(/\s+/g, ' ').trim()))
      .map((entry) => entry.name)
    expect(missing).toEqual([])
  })

  it.each(guideSlugs)('%s ships a FAQPage exactly when it shows an FAQ', (slug) => {
    const { faqNode } = renderGuide(slug)
    expect(Boolean(faqNode)).toBe(readGuide(slug).includes('<GuideFaqList'))
  })

  it.each(guideSlugs)('%s builds the schema from the array it renders, not a second copy', (slug) => {
    const source = readGuide(slug)
    if (!source.includes('<GuideFaqList')) return

    // One array, named, used twice. An inline `items={[…]}` literal is what let
    // the two drift apart on this page in the first place.
    expect(source).toContain('<GuideFaqList items={faq} />')
    expect(source).toContain('const faqJsonLd = buildGuideFaqJsonLd(faq)')
    expect(source).not.toMatch(/<GuideFaqList items=\{\[/)
    expect(source).not.toMatch(/'@type': 'FAQPage'/)
  })
})
