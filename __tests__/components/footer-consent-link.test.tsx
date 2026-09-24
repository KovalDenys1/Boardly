import { render, screen } from '@testing-library/react'
import '@/i18n'
import Footer from '@/components/Footer'
import * as consent from '@/lib/consent'

jest.mock('@/lib/consent', () => ({
  reopenGoogleConsentMessage: jest.fn(),
}))

/**
 * #1153: a footer control reopens Google's consent message via the googlefc
 * revocation API. It only makes sense where the adsbygoogle loader itself
 * runs — production (#1152) — so it must not render elsewhere, and the
 * check must key off the real Vercel environment: `next build` sets
 * `NODE_ENV=production` for a Preview deployment too, so a bare `NODE_ENV`
 * check would render this control (and imply the loader ran) on Preview.
 */
describe('Footer — consent settings control (#1153)', () => {
  const env = process.env as Record<string, string | undefined>
  const original = {
    NODE_ENV: env.NODE_ENV,
    VERCEL_ENV: env.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: env.NEXT_PUBLIC_VERCEL_ENV,
  }

  // `env.KEY = undefined` does NOT delete the key — Node coerces it to the
  // *string* "undefined", which `isNonProductionDeployment` then reads as an
  // unrecognized declared Vercel environment and tips toward "production".
  function setOrDelete(key: string, value: string | undefined) {
    if (value === undefined) {
      delete env[key]
    } else {
      env[key] = value
    }
  }

  afterEach(() => {
    setOrDelete('NODE_ENV', original.NODE_ENV)
    setOrDelete('VERCEL_ENV', original.VERCEL_ENV)
    setOrDelete('NEXT_PUBLIC_VERCEL_ENV', original.NEXT_PUBLIC_VERCEL_ENV)
    jest.clearAllMocks()
  })

  it('renders and reopens the consent message in production (no Vercel env declared)', () => {
    setOrDelete('NODE_ENV', 'production')
    setOrDelete('VERCEL_ENV', undefined)
    setOrDelete('NEXT_PUBLIC_VERCEL_ENV', undefined)
    render(<Footer />)

    const button = screen.getByRole('button', { name: 'Privacy and cookie settings' })
    button.click()

    expect(consent.reopenGoogleConsentMessage).toHaveBeenCalledTimes(1)
  })

  it('renders on Vercel Production', () => {
    setOrDelete('NODE_ENV', 'production')
    setOrDelete('VERCEL_ENV', 'production')
    setOrDelete('NEXT_PUBLIC_VERCEL_ENV', 'production')
    render(<Footer />)

    expect(screen.getByRole('button', { name: 'Privacy and cookie settings' })).toBeInTheDocument()
  })

  it('does not render in development, where the loader never runs', () => {
    setOrDelete('NODE_ENV', 'development')
    setOrDelete('VERCEL_ENV', undefined)
    setOrDelete('NEXT_PUBLIC_VERCEL_ENV', undefined)
    render(<Footer />)

    expect(screen.queryByRole('button', { name: 'Privacy and cookie settings' })).toBeNull()
  })

  it('does not render on a Vercel Preview deployment, even though `next build` sets NODE_ENV=production there too', () => {
    setOrDelete('NODE_ENV', 'production')
    setOrDelete('VERCEL_ENV', 'preview')
    setOrDelete('NEXT_PUBLIC_VERCEL_ENV', 'preview')
    render(<Footer />)

    expect(screen.queryByRole('button', { name: 'Privacy and cookie settings' })).toBeNull()
  })
})
