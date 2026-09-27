import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { metadata } from '@/app/premium/page'
import { PREMIUM_DESCRIPTION, PREMIUM_URL, premiumProductJsonLd } from '@/app/premium/premium-json-ld'
import PremiumContent from '@/app/premium/PremiumContent'
import { organizationNode } from '@/lib/organization-json-ld'
import { trackPremiumCta } from '@/lib/analytics'
import { toPlanPrice, type PremiumPricing } from '@/lib/premium-plans'

// The page itself only asks Stripe for the two prices; the test supplies them
// so nothing here reaches the network or needs a Stripe key.
jest.mock('@/lib/server/premium-pricing', () => ({
  getPremiumPricing: jest.fn().mockResolvedValue({ monthly: null, yearly: null }),
}))

jest.mock('@/lib/analytics', () => ({
  trackPremiumCta: jest.fn(),
}))

jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => <footer data-testid="footer" />,
}))

// Resolve keys against the real English locale, with the same {{...}}
// interpolation i18next does, so the test reads the visible copy.
jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string, vars?: Record<string, unknown>) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
        if (typeof value !== 'string') return key
        return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars?.[name] ?? ''))
      },
    }),
  }
})

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'user-1' } }, status: 'authenticated' }),
}))

const root = process.cwd()
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

const BOTH_PLANS: PremiumPricing = {
  monthly: toPlanPrice('monthly', 299, 'usd'),
  yearly: toPlanPrice('yearly', 1999, 'usd'),
}

/** The checkout buttons stay disabled until the § 19 box is ticked (#1162). */
function tickConsent() {
  fireEvent.click(screen.getAllByRole('checkbox')[0])
}

function sentBody(): { plan: string; consent: Record<string, string> } {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string)
}

describe('/premium metadata', () => {
  it('carries the same metadata discipline as /about', () => {
    expect(metadata.title).toEqual({ absolute: 'Boardly Premium – Subscription Plans and Pricing' })
    expect(metadata.description).toBe(PREMIUM_DESCRIPTION)
    expect(metadata.alternates?.canonical).toBe('https://boardly.online/premium')
    expect(metadata.openGraph?.url).toBe(PREMIUM_URL)
    expect(metadata.openGraph?.title).toBe('Boardly Premium')
    expect(metadata.robots).toEqual({ index: true, follow: true })
  })
})

describe('/premium JSON-LD', () => {
  it('offers exactly the plans Stripe priced, against the shared Organization node', () => {
    const node = premiumProductJsonLd(BOTH_PLANS)
    expect(node['@type']).toBe('Product')
    expect(node.url).toBe(PREMIUM_URL)
    expect(node.brand).toEqual({ '@id': organizationNode['@id'] })
    expect(node.offers).toEqual([
      expect.objectContaining({ price: '2.99', priceCurrency: 'USD' }),
      expect.objectContaining({ price: '19.99', priceCurrency: 'USD' }),
    ])
  })

  it('publishes no Offer for a plan Stripe could not price', () => {
    expect(premiumProductJsonLd({ monthly: BOTH_PLANS.monthly, yearly: null }).offers).toHaveLength(1)
    expect(premiumProductJsonLd({ monthly: null, yearly: null })).not.toHaveProperty('offers')
  })
})

describe('/premium prices', () => {
  it('shows only amounts that came off a Stripe price', () => {
    // No price literal in the page or its entity nodes: every figure on screen
    // is the one the checkout would charge.
    for (const file of ['app/premium/PremiumContent.tsx', 'app/premium/premium-json-ld.ts']) {
      expect(read(file)).not.toMatch(/[$€£]\s?\d/)
      expect(read(file)).not.toMatch(/\d+([.,]\d+)?\s?(kr|NOK|USD|EUR)\b/)
    }
  })

  it('opens on the yearly plan and states the saving it can prove', () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)
    expect(screen.getByTestId('premium-amount')).toHaveTextContent('$19.99')
    expect(screen.getByRole('radio', { name: /Yearly/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('Save 44%')).toBeInTheDocument()
    // 1999 / 12, derived rather than typed
    expect(screen.getByText(/\$1\.67 a month/)).toBeInTheDocument()
  })

  it('falls back to the monthly plan alone when Stripe has no yearly price', () => {
    render(<PremiumContent pricing={{ monthly: BOTH_PLANS.monthly, yearly: null }} />)
    expect(screen.getByTestId('premium-amount')).toHaveTextContent('$2.99')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(screen.queryByText(/Save /)).not.toBeInTheDocument()
    expect(screen.getByText(/yearly plan is not available right now/)).toBeInTheDocument()
  })
})

const fetchMock = jest.fn()

describe('/premium checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    fetchMock.mockResolvedValue({ json: async () => ({ url: 'https://checkout.stripe.com/s' }) })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('sends the selected plan and reports it to the funnel', async () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)
    tickConsent()
    fireEvent.click(screen.getAllByRole('button', { name: /Get Premium/ })[0])

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/stripe/checkout', expect.objectContaining({ method: 'POST' }))
    expect(sentBody().plan).toBe('yearly')
    expect(trackPremiumCta).toHaveBeenCalledWith('premium_page_hero', 'yearly')
  })

  it('switches the charge with the toggle, from both CTAs', async () => {
    render(<PremiumContent pricing={BOTH_PLANS} />)
    fireEvent.click(screen.getByRole('radio', { name: /Monthly/ }))
    tickConsent()

    const ctas = screen.getAllByRole('button', { name: /Get Premium/ })
    expect(ctas).toHaveLength(2)
    fireEvent.click(ctas[1])

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(sentBody().plan).toBe('monthly')
    expect(trackPremiumCta).toHaveBeenCalledWith('premium_page_closing', 'monthly')
  })

  it('asks for a verified email and resends the link when checkout answers 403 (#1139)', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Verify your email address before buying Premium.', code: 'email_unverified' }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    render(<PremiumContent pricing={BOTH_PLANS} />)
    tickConsent()
    fireEvent.click(screen.getAllByRole('button', { name: /Get Premium/ })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(/verified email address/)
    fireEvent.click(screen.getByRole('button', { name: /Send the verification email/ }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/resend-verification', expect.objectContaining({ method: 'POST' }))
    )
    expect(await screen.findByText(/Check your inbox for the verification link/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send the verification email/ })).toBeDisabled()
  })

  it.each([
    ['a rate limit', { ok: false, status: 429, json: async () => ({ error: 'Too many requests' }) }],
    ['a server error', { ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) }],
    ['an answer without success', { ok: true, status: 200, json: async () => ({}) }],
  ])('does not claim the email was sent after %s (#1139)', async (_label, resendResponse) => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Verify your email address before buying Premium.', code: 'email_unverified' }),
      })
      .mockResolvedValueOnce(resendResponse)
    render(<PremiumContent pricing={BOTH_PLANS} />)
    tickConsent()
    fireEvent.click(screen.getAllByRole('button', { name: /Get Premium/ })[0])
    fireEvent.click(await screen.findByRole('button', { name: /Send the verification email/ }))

    expect(await screen.findByText(/We could not send the email/)).toBeInTheDocument()
    expect(screen.queryByText(/Check your inbox for the verification link/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send the verification email/ })).toBeEnabled()
  })

  it('says so instead of hanging when checkout cannot be opened', async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ error: 'nope' }) })
    render(<PremiumContent pricing={BOTH_PLANS} />)
    tickConsent()
    fireEvent.click(screen.getAllByRole('button', { name: /Get Premium/ })[0])

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not open checkout/)
  })
})
