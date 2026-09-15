import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { ComponentType } from 'react'
import { render } from '@testing-library/react'
import { ALL_GUIDES } from '@/lib/guides-catalog'
import { buildGuideFaqJsonLd } from '@/app/guides/components/GuideLayout'

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

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()

function renderGuide(slug: string) {
  const Page = require(`../../app/guides/${slug}/page`).default as ComponentType
  const { container } = render(<Page />)
  const nodes = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (script) => JSON.parse(script.textContent ?? '{}') as { '@type': string },
  )
  return {
    faqNode: nodes.find((node) => node['@type'] === 'FAQPage') as FaqNode | undefined,
    text: visibleText(container),
    // What `GuideFaqList` actually drew, read back off the DOM. This is the
    // half a source grep cannot check: it survives any reformat, and it fails
    // on a second hand-written node however that node is spelled.
    renderedQuestions: Array.from(
      container.querySelectorAll('[data-testid="guide-faq-question"]'),
    ).map((heading) => normalize(heading.textContent ?? '')),
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

  it.each(guideSlugs)('%s schema carries exactly the questions the page renders', (slug) => {
    const { faqNode, renderedQuestions } = renderGuide(slug)

    if (!faqNode) {
      expect(renderedQuestions).toEqual([])
      return
    }

    // Set equality, both directions, off the rendered DOM. The two `includes`
    // tests above only catch schema the page does not show; this one also
    // catches a schema that quietly drops or reorders a question it does.
    expect(faqNode.mainEntity.map((entry) => normalize(entry.name))).toEqual(renderedQuestions)
  })

  it.each(guideSlugs)('%s does not ship a thin FAQPage', (slug) => {
    const { faqNode } = renderGuide(slug)
    if (!faqNode) return

    // Empty `mainEntity` is invalid FAQPage and a single question is the thin
    // pattern the spam policy targets. `buildGuideFaqJsonLd` refuses both, so
    // this is the assertion that the guard is actually in the path.
    expect(faqNode.mainEntity.length).toBeGreaterThanOrEqual(2)
  })

  it.each(guideSlugs)('%s builds the schema from the array it renders, not a second copy', (slug) => {
    const source = readGuide(slug)
    if (!source.includes('<GuideFaqList')) return

    // One array, named, used twice. These are source greps, so they are written
    // whitespace-tolerant on purpose: a Prettier pass that wraps the JSX or the
    // call across lines changes nothing that matters, and a check that fails on
    // it is a check somebody eventually deletes.
    expect(source).toMatch(/<GuideFaqList\s+items=\{faq\}\s*\/>/)
    expect(source).toMatch(/const\s+faqJsonLd\s*=\s*buildGuideFaqJsonLd\(\s*faq\s*,?\s*\)/)
    // An inline `items={[…]}` literal is what let the two drift apart on this
    // page in the first place.
    expect(source).not.toMatch(/<GuideFaqList\s+items=\{\s*\[/)
    // Any quote style: the old single-quoted literal could not see a node a
    // formatter had rewritten with double quotes.
    expect(source).not.toMatch(/['"`]@type['"`]\s*:\s*['"`]FAQPage['"`]/)
  })
})

describe('buildGuideFaqJsonLd', () => {
  const item = { question: 'Q', answer: 'A' }

  it('refuses a FAQPage too thin to be worth one', () => {
    expect(() => buildGuideFaqJsonLd([])).toThrow(/at least two questions/)
    expect(() => buildGuideFaqJsonLd([item])).toThrow(/at least two questions/)
  })

  it('maps two or more questions onto the FAQPage shape', () => {
    const node = buildGuideFaqJsonLd([item, { question: 'Q2', answer: 'A2' }])

    expect(node['@type']).toBe('FAQPage')
    expect(node.mainEntity).toHaveLength(2)
    expect(node.mainEntity[0]).toEqual({
      '@type': 'Question',
      name: 'Q',
      acceptedAnswer: { '@type': 'Answer', text: 'A' },
    })
  })
})
