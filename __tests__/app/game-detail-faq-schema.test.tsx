import { render } from '@testing-library/react'

import YahtzeePage from '@/app/games/yahtzee/page'
import { getCatalogGames } from '@/lib/game-catalog'

// Resolve keys against the real English bundle – the only one a crawler reads
// – so the test compares the schema with the text a visitor actually sees.
jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  const lookup = (key: string) =>
    key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const value = lookup(key)
        if (typeof value !== 'string') return key
        return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => String(options?.[name] ?? ''))
      },
    }),
  }
})
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }))
jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ isGuest: false }) }))
jest.mock('@/components/Footer', () => ({ __esModule: true, default: () => null }))
jest.mock('@/app/games/components/PlayVsBotButton', () => ({ __esModule: true, default: () => null }))
jest.mock('@/app/games/components/GameScreenshot', () => ({ __esModule: true, default: () => null, hasScreenshot: () => false }))

type Question = { name: string; acceptedAnswer: { text: string } }

function renderPage() {
  const { container } = render(<YahtzeePage />)
  const schemas = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
    (script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>
  )
  const clone = container.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script').forEach((script) => script.remove())
  return { container, schemas, text: (clone.textContent ?? '').replace(/\s+/g, ' ') }
}

/**
 * #923's rule, held for the game page the way guide-faq-schema.test.tsx holds
 * it for the guides: every question and answer in the FAQPage JSON-LD has to
 * be text the visitor can read on the page. The catalog array is the single
 * source of both, so this is the check that the page really renders it.
 */
describe('/games/yahtzee FAQ schema (#1077)', () => {
  it('puts the direct answer first and every catalog FAQ entry after it', () => {
    const { schemas } = renderPage()
    const faq = schemas.find((schema) => schema['@type'] === 'FAQPage')!
    const entries = faq.mainEntity as Question[]
    const seo = getCatalogGames().find((game) => game.id === 'yahtzee')!.seo!
    expect(entries).toHaveLength(1 + seo.faq!.length)
  })

  it('shows every schema question and answer on the page', () => {
    const { schemas, text } = renderPage()
    const faq = schemas.find((schema) => schema['@type'] === 'FAQPage')!
    for (const entry of faq.mainEntity as Question[]) {
      expect({ question: entry.name, visible: text.includes(entry.name) }).toEqual({ question: entry.name, visible: true })
      expect({ answer: entry.acceptedAnswer.text, visible: text.includes(entry.acceptedAnswer.text) }).toEqual({
        answer: entry.acceptedAnswer.text,
        visible: true,
      })
    }
  })

  it('renders the long-form sections with the ids guides link to', () => {
    const { container } = renderPage()
    for (const id of ['rules', 'scoring', 'modes', 'strategy', 'mistakes', 'multiplayer', 'audience', 'history', 'faq']) {
      expect({ id, present: container.querySelector(`section#${id}`) !== null }).toEqual({ id, present: true })
    }
    // Stacked cards, not a table: fifteen rows of three columns do not fit 320 px.
    expect(container.querySelector('#scoring table')).toBeNull()
    expect(container.querySelectorAll('#scoring li')).toHaveLength(15)
  })
})
