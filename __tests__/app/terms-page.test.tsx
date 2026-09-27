import { readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, within } from '@testing-library/react'
import TermsContent from '@/app/terms/TermsContent'
import { COMMUNITY_RULES_BANNED, MODERATION_ACTIONS } from '@/lib/community-rules'
import { SUPPORT_EMAIL } from '@/lib/organization-json-ld'
import { RETENTION_DAYS } from '@/lib/retention-periods'
import { TERMS_FIGURES, TERMS_VERSION } from '@/lib/terms-version'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

// Section 3 has its own test (terms-premium.test.tsx); here it is a stub, so this
// file tests the rest of the Terms around it.
jest.mock('@/app/terms/PremiumTerms', () => ({
  __esModule: true,
  default: () => <section data-testid="terms-premium" />,
}))

const mockI18n = { locale: 'en' as 'en' | 'no' }

jest.mock('@/lib/i18n-helpers', () => {
  const bundles = {
    en: require('@/locales/en').default,
    no: require('@/locales/no').default,
  }
  return {
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, string | number>) => {
        const raw = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundles[mockI18n.locale])
        const text = typeof raw === 'string' ? raw : key
        return vars
          ? text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
          : text
      },
      i18n: { language: mockI18n.locale },
    }),
  }
})

const root = process.cwd()
const source = readFileSync(path.join(root, 'app/terms/TermsContent.tsx'), 'utf8')
const pageSource = readFileSync(path.join(root, 'app/terms/page.tsx'), 'utf8')

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole))
}

const seller = { name: 'Test Operator', address: 'Street 1, 0001 Oslo', email: SUPPORT_EMAIL }

describe('/terms (#1166)', () => {
  beforeEach(() => {
    mockI18n.locale = 'en'
  })

  it('renders every section through t(), with keys in all four locales and no fallback string', () => {
    const literal = [...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1])
    const keys = [
      ...literal,
      ...COMMUNITY_RULES_BANNED.map((id) => `rules.banned.${id}`),
      ...MODERATION_ACTIONS.map((id) => `rules.actions.${id}`),
    ]
    expect(literal.length).toBeGreaterThanOrEqual(50)
    for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
    expect(source).not.toMatch(/\bt\((['`])[^'`]+\1,\s*'/)
    // The page is a server wrapper around the client sections, and holds no copy.
    expect(pageSource).toContain('<TermsContent seller={seller} />')
    expect(pageSource).not.toMatch(/<p>|<h2/)
  })

  it('keeps section 3 where it was, between the accounts and the community rules', () => {
    render(<TermsContent seller={null} />)
    const ids = Array.from(document.querySelectorAll('[data-testid^="terms-"]')).map((el) => el.getAttribute('data-testid'))
    expect(ids.indexOf('terms-accounts')).toBeLessThan(ids.indexOf('terms-premium'))
    expect(ids.indexOf('terms-premium')).toBeLessThan(ids.indexOf('terms-conduct'))
  })

  it('states the age policy: accounts from 13, confirmed at sign-up; guests unasked; Premium in section 3', () => {
    render(<TermsContent seller={null} />)
    const accounts = screen.getByTestId('terms-accounts')
    expect(accounts).toHaveTextContent(en.terms.accounts.age)
    expect(en.terms.accounts.age).toContain('13 or older')
    expect(accounts).toHaveTextContent('Guests do not need to confirm their age.')
    expect(accounts).toHaveTextContent(en.terms.accounts.premiumAge)
    // The figures come from the retention module the cleanup jobs read.
    expect(accounts).toHaveTextContent(
      fill(en.terms.accounts.guests, { guestIdle: RETENTION_DAYS.guestIdle, guestPlayed: RETENTION_DAYS.guestPlayedIdle })
    )
    expect(TERMS_FIGURES.unverifiedDays).toBe(RETENTION_DAYS.unverifiedAccounts)
  })

  it('lists the community rules and moderation actions from the shared lists, and links /rules', () => {
    render(<TermsContent seller={null} />)
    const conduct = screen.getByTestId('terms-conduct')
    expect(within(conduct).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      COMMUNITY_RULES_BANNED.map((id) => en.rules.banned[id])
    )
    expect(within(conduct).getByRole('link', { name: en.terms.conduct.rulesLink })).toHaveAttribute('href', '/rules')

    const moderation = screen.getByTestId('terms-moderation')
    expect(within(moderation).getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      MODERATION_ACTIONS.map((id) => en.rules.actions[id])
    )
  })

  it('names the content-notice route: the Report action and support@boardly.online (#1172)', () => {
    render(<TermsContent seller={null} />)
    const moderation = screen.getByTestId('terms-moderation')
    expect(moderation).toHaveTextContent(en.terms.moderation.report)
    expect(en.terms.moderation.report).toContain('Report on a chat message')
    expect(within(moderation).getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`)
    expect(moderation).toHaveTextContent(en.terms.moderation.appeal)
  })

  it('no longer excludes all liability, and keeps the statutory remedies (L3-04)', () => {
    const liability = Object.values(en.terms.liability).join(' ')
    expect(liability).not.toMatch(/as is|not liable for any damages/i)
    expect(liability).toContain('chapter 5')
    expect(liability).toContain('section 3')
    expect(liability).toContain('gross negligence')
  })

  it('gives changes notice and a free exit, and termination reasons, a warning and a refund (L3-07, L3-08)', () => {
    expect(en.terms.changes.notice).toContain('at least 30 days')
    expect(en.terms.changes.exit).toContain('free of charge')
    expect(JSON.stringify(en.terms)).not.toMatch(/for any other reason|Continued use of Boardly after changes constitutes/)
    expect(en.terms.termination.oursLead).toContain('only for one of these reasons')
    expect(Object.keys(en.terms.termination.reasons)).toEqual(['breach', 'law', 'age', 'security'])
    expect(en.terms.termination.premium).toContain('refund')
    // digitalytelsesloven § 33 fourth paragraph (#1165).
    expect(en.terms.termination.reminder).toContain('at least every six months')
  })

  it('names governing law, the home court, Forbrukertilsynet and Forbrukerklageutvalget (L3-14)', () => {
    render(<TermsContent seller={null} />)
    const law = screen.getByTestId('terms-law')
    expect(law).toHaveTextContent('Norwegian law applies')
    expect(law).toHaveTextContent('tvisteloven section 4-5 (7)')
    expect(law).toHaveTextContent('Forbrukertilsynet')
    expect(law).toHaveTextContent('Forbrukerklageutvalget')
    expect(within(law).getByRole('link', { name: 'forbrukertilsynet.no' })).toHaveAttribute(
      'href',
      'https://www.forbrukertilsynet.no'
    )
  })

  it('dates the page from TERMS_VERSION, never the render date', () => {
    render(<TermsContent seller={null} />)
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const expected = new Date(`${TERMS_VERSION}T00:00:00Z`).toLocaleDateString('en', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
    expect(screen.getByText(`Last updated: ${expected}`)).toBeInTheDocument()
    expect(source).not.toMatch(/new Date\(\)/)
  })

  it('draws "Who we are" only when the operator is known', () => {
    const { unmount } = render(<TermsContent seller={null} />)
    expect(screen.queryByTestId('terms-seller')).not.toBeInTheDocument()
    unmount()

    render(<TermsContent seller={seller} />)
    const who = screen.getByTestId('terms-seller')
    expect(who).toHaveTextContent('Boardly is operated by Test Operator, Street 1, 0001 Oslo, Norway.')
    expect(within(who).getByRole('link', { name: SUPPORT_EMAIL })).toHaveAttribute('href', `mailto:${SUPPORT_EMAIL}`)
  })

  it('renders in Norwegian (angrerettloven § 8 second paragraph)', () => {
    mockI18n.locale = 'no'
    render(<TermsContent seller={null} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(no.terms.title)
    expect(screen.getByTestId('terms-law')).toHaveTextContent(no.terms.law.law)
    expect(screen.queryByText(en.terms.law.law)).not.toBeInTheDocument()
  })

  it('uses no em dash in any language', () => {
    for (const locale of [en, no, ru, uk]) {
      expect(JSON.stringify(locale.terms)).not.toContain('—')
    }
  })
})
