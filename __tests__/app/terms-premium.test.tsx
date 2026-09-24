import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import PremiumTerms from '@/app/terms/PremiumTerms'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { LINK_SUPPORT_URL, LINK_TERMS_URL } from '@/lib/sold-through-link'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

// Resolve keys against a real bundle, switchable per test, as the withdrawal
// page test does, so the section is rendered in English and in Norwegian.
const mockI18n = { locale: 'en' as 'en' | 'no' }

jest.mock('@/lib/i18n-helpers', () => {
  const bundles = {
    en: require('@/locales/en').default,
    no: require('@/locales/no').default,
  }
  return {
    useTranslation: () => ({
      t: (key: string) => {
        const raw = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundles[mockI18n.locale])
        return typeof raw === 'string' ? raw : key
      },
    }),
  }
})

const root = process.cwd()
const source = readFileSync(path.join(root, 'app/terms/PremiumTerms.tsx'), 'utf8')
const page = readFileSync(path.join(root, 'app/terms/page.tsx'), 'utf8')

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

describe('/terms, section 3: Premium sold through Link (#1179)', () => {
  beforeEach(() => {
    mockI18n.locale = 'en'
  })

  it('uses only translation keys that exist in all four locales, and never a fallback', () => {
    const keys = [...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1])
    expect(keys.length).toBeGreaterThanOrEqual(10)
    for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
    expect(source).not.toMatch(/\bt\('[^']+',\s*'/)
  })

  it('is what /terms renders in place of the old English section', () => {
    expect(page).toContain('<PremiumTerms />')
    expect(page).not.toContain('No VAT is added')
  })

  it('names Link as merchant of record, links its terms and support, and keeps our own channels', () => {
    render(<PremiumTerms />)

    const section = screen.getByTestId('terms-premium')
    expect(section).toHaveTextContent(en.terms.premium.title)
    expect(section).toHaveTextContent(en.terms.premium.seller)
    expect(en.terms.premium.seller).toContain('merchant of record')
    expect(en.terms.premium.seller).toContain('Sold through Link, LLC')
    expect(section).toHaveTextContent(en.terms.premium.withdrawal)
    expect(section).toHaveTextContent(en.terms.premium.confirmation)

    expect(screen.getByRole('link', { name: en.terms.premium.linkTermsLabel })).toHaveAttribute('href', LINK_TERMS_URL)
    expect(screen.getByRole('link', { name: en.withdrawal.linkSupportLabel })).toHaveAttribute('href', LINK_SUPPORT_URL)
    expect(screen.getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`)
    expect(screen.getByRole('link', { name: en.premium.withdrawalFormLink })).toHaveAttribute('href', '/withdrawal')
  })

  it('renders the section in Norwegian', () => {
    mockI18n.locale = 'no'
    render(<PremiumTerms />)

    const section = screen.getByTestId('terms-premium')
    expect(section).toHaveTextContent(no.terms.premium.title)
    expect(section).toHaveTextContent(no.terms.premium.withdrawal)
    expect(section).not.toHaveTextContent(en.terms.premium.withdrawal)
  })

  it('no longer says that no VAT is added, anywhere Premium is priced', () => {
    for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
      const copy = [locale.premium.priceNoteTax, ...Object.values(locale.terms.premium)].join(' ')
      expect({ locale: name, mentionsLink: copy.includes('Link') }).toEqual({ locale: name, mentionsLink: true })
      expect(copy).not.toMatch(/no VAT|ikke til merverdiavgift|НДС сверху не|ПДВ зверху не/)
    }
  })

  it('keeps the 14-day right and uses no em dash', () => {
    for (const locale of [en, no, ru, uk]) {
      expect(locale.terms.premium.withdrawal).toContain('14')
      expect(JSON.stringify(locale.terms)).not.toContain('—')
    }
  })
})
