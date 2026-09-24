import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import PremiumContent from '@/app/premium/PremiumContent'
import { toPlanPrice, type PremiumPricing } from '@/lib/premium-plans'
import { TERMS_VERSION, WITHDRAWAL_INFO_VERSION } from '@/lib/terms-version'
import en from '@/locales/en'
import no from '@/locales/no'
import ru from '@/locales/ru'
import uk from '@/locales/uk'

jest.mock('@/lib/analytics', () => ({
  trackPremiumCta: jest.fn(),
}))

jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => null,
}))

// Resolve keys against a real bundle, switchable per test, so the block is
// rendered once in English and once in Norwegian (angrerettloven § 8 fourth
// paragraph: the withdrawal information has to be given in Norwegian).
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
          ? text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
              name in vars ? String(vars[name]) : whole
            )
          : text
      },
    }),
  }
})

const mockSession = { status: 'authenticated' as 'authenticated' | 'unauthenticated' }

jest.mock('next-auth/react', () => ({
  useSession: () =>
    mockSession.status === 'authenticated'
      ? { data: { user: { id: 'user-1' } }, status: 'authenticated' }
      : { data: null, status: 'unauthenticated' },
}))

const root = process.cwd()
const source = readFileSync(path.join(root, 'app/premium/PremiumContent.tsx'), 'utf8')

const BOTH_PLANS: PremiumPricing = {
  monthly: toPlanPrice('monthly', 299, 'usd'),
  yearly: toPlanPrice('yearly', 1999, 'usd'),
}

function localeValue(locale: object, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale)
}

function checkoutButtons() {
  return screen.getAllByRole('button', { name: en.premium.cta })
}

describe('/premium consent and withdrawal information (#1162)', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockI18n.locale = 'en'
    mockSession.status = 'authenticated'
    fetchMock.mockResolvedValue({ json: async () => ({ url: 'https://checkout.stripe.com/s' }) })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('uses only translation keys that exist in all four locales, and never a fallback', () => {
    const keys = [...source.matchAll(/\bt\('([^']+)'/g)].map((match) => match[1])
    expect(keys).toEqual(
      expect.arrayContaining([
        'premium.consentLabel',
        'premium.consentRequired',
        'premium.withdrawalTitle',
        'premium.withdrawalBody',
        'premium.withdrawalHow',
        'premium.withdrawalFormLink',
        'premium.withdrawalStartNow',
        'premium.priceNoteTax',
        'premium.priceNoteConversion',
        'premium.yearlyRefundNote',
      ])
    )
    for (const [name, locale] of Object.entries({ en, no, ru, uk })) {
      const missing = keys.filter((key) => typeof localeValue(locale, key) !== 'string')
      expect({ locale: name, missing }).toEqual({ locale: name, missing: [] })
    }
    expect(source).not.toMatch(/\bt\('[^']+',\s*'/)
  })

  it('gives the withdrawal information and the price notes above the button, with the form linked', () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)

    const block = screen.getByTestId('premium-withdrawal')
    expect(block).toHaveTextContent(en.premium.withdrawalTitle)
    expect(block).toHaveTextContent(en.premium.withdrawalBody)
    expect(block).toHaveTextContent(en.premium.withdrawalStartNow)
    expect(block).toHaveTextContent(en.premium.withdrawalHow)
    expect(screen.getByRole('link', { name: en.premium.withdrawalFormLink })).toHaveAttribute('href', '/withdrawal')

    expect(screen.getByText(new RegExp(en.premium.priceNoteTax.replace(/[.;]/g, '\\$&')))).toBeInTheDocument()
    expect(screen.getByText(/conversion fee of 2 to 4%/)).toBeInTheDocument()

    // The information comes before the purchase, in document order.
    const hero = checkoutButtons()[0]
    expect(block.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('states the yearly refund rule only while the yearly plan is selected', () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)
    expect(screen.getByText(en.premium.yearlyRefundNote)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Monthly/ }))
    expect(screen.queryByText(en.premium.yearlyRefundNote)).not.toBeInTheDocument()
  })

  it('keeps both checkout buttons disabled until the box is ticked, and one box enables both', () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)

    const boxes = screen.getAllByRole('checkbox', { name: en.premium.consentLabel })
    expect(boxes).toHaveLength(2)
    for (const box of boxes) expect(box).not.toBeChecked()

    for (const button of checkoutButtons()) {
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-disabled', 'true')
    }

    fireEvent.click(boxes[1])

    for (const box of boxes) expect(box).toBeChecked()
    for (const button of checkoutButtons()) {
      expect(button).toBeEnabled()
      expect(button).toHaveAttribute('aria-disabled', 'false')
    }
  })

  it('is a real checkbox named by its label', () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)
    const box = screen.getAllByRole('checkbox')[0] as HTMLInputElement
    expect(box.tagName).toBe('INPUT')
    expect(box.type).toBe('checkbox')
    expect(box.id).toBe('premium-consent-hero')
    const label = document.querySelector(`label[for="${box.id}"]`)
    expect(label).toHaveTextContent(en.premium.consentLabel)
  })

  it('sends the versions of the text that was on screen and when the box was ticked', async () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)
    const before = Date.now()
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(checkoutButtons()[0])

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.plan).toBe('yearly')
    expect(body.consent.termsVersion).toBe(TERMS_VERSION)
    expect(body.consent.withdrawalInfoVersion).toBe(WITHDRAWAL_INFO_VERSION)
    const acceptedAt = Date.parse(body.consent.acceptedAt)
    expect(acceptedAt).toBeGreaterThanOrEqual(before)
    expect(acceptedAt).toBeLessThanOrEqual(Date.now())
  })

  it('shows the consent message, not the generic one, when the route answers consent_required', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ error: 'nope', code: 'consent_required' }) })
    render(<PremiumContent pricing={BOTH_PLANS} />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(checkoutButtons()[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(en.premium.consentRequired)
  })

  it('renders the same block in Norwegian, with a different label and heading', () => {
    mockI18n.locale = 'no'
    render(<PremiumContent pricing={BOTH_PLANS} />)

    expect(no.premium.consentLabel).not.toBe(en.premium.consentLabel)
    expect(no.premium.withdrawalTitle).not.toBe(en.premium.withdrawalTitle)

    const boxes = screen.getAllByRole('checkbox', { name: no.premium.consentLabel })
    expect(boxes).toHaveLength(2)
    expect(screen.getByRole('heading', { name: no.premium.withdrawalTitle })).toBeInTheDocument()
    expect(screen.getByTestId('premium-withdrawal')).toHaveTextContent(no.premium.withdrawalBody)
    expect(screen.getByRole('link', { name: no.premium.withdrawalFormLink })).toHaveAttribute('href', '/withdrawal')

    const buttons = screen.getAllByRole('button', { name: no.premium.cta })
    for (const button of buttons) expect(button).toBeDisabled()
    fireEvent.click(boxes[0])
    for (const button of buttons) expect(button).toBeEnabled()
  })

  it('shows the information but no box to someone signed out, who keeps the sign-in link', () => {
    mockSession.status = 'unauthenticated'
    render(<PremiumContent pricing={BOTH_PLANS} />)

    expect(screen.getByTestId('premium-withdrawal')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: en.premium.ctaSignedOut })).toHaveLength(2)
  })
})
