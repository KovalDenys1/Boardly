import { render, screen } from '@testing-library/react'
import AboutPage, { metadata } from '@/app/about/page'
import { aboutPageJsonLd, organizationJsonLd } from '@/app/about/about-json-ld'
import { organizationNode } from '@/lib/organization-json-ld'

// Resolve keys against the real English locale so the test checks the visible
// entity statement, not just that a key was requested.
jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string) =>
        key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) ?? key,
    }),
  }
})

jest.mock('@/components/Footer', () => ({
  __esModule: true,
  default: () => <footer data-testid="footer" />,
}))

describe('/about metadata', () => {
  it('has a title, description, canonical and Open Graph url', () => {
    expect(metadata.title).toEqual({ absolute: 'About Boardly – Free Online Board Games with Friends' })
    expect(metadata.description).toMatch(/^Boardly \(boardly\.online\) is a free real-time multiplayer board games website/)
    expect(metadata.alternates?.canonical).toBe('https://boardly.online/about')
    expect(metadata.openGraph?.url).toBe('https://boardly.online/about')
    expect(metadata.openGraph?.title).toBe('About Boardly')
    expect(metadata.robots).toEqual({ index: true, follow: true })
  })
})

describe('/about JSON-LD', () => {
  it('describes Boardly as an Organization with sameAs and a support contact', () => {
    expect(organizationJsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Boardly',
      url: 'https://boardly.online',
      logo: { '@type': 'ImageObject', url: 'https://boardly.online/brand/logo.png' },
      sameAs: [
        'https://github.com/KovalDenys1/Boardly',
        'https://www.tiktok.com/@playboardly',
        'https://www.youtube.com/@playboardly',
      ],
      contactPoint: { '@type': 'ContactPoint', email: 'support@boardly.online' },
    })
  })

  it('links the AboutPage node to the Organization node', () => {
    expect(aboutPageJsonLd['@type']).toBe('AboutPage')
    expect(aboutPageJsonLd.url).toBe('https://boardly.online/about')
    expect(aboutPageJsonLd.about).toEqual({ '@id': organizationJsonLd['@id'] })
  })

  it('is the same Organization node the root layout publishes', () => {
    expect(organizationNode['@id']).toBe(organizationJsonLd['@id'])
    expect(organizationNode.logo).toBe(organizationJsonLd.logo)
  })

  it('renders both nodes as ld+json scripts', () => {
    const { container } = render(<AboutPage />)
    const scripts = Array.from(container.querySelectorAll('script[type="application/ld+json"]'))
    const types = scripts.map((s) => JSON.parse(s.textContent ?? '{}')['@type'])
    expect(types).toEqual(['Organization', 'AboutPage'])
  })
})

describe('/about content', () => {
  it('opens with the plain entity statement in visible HTML', () => {
    render(<AboutPage />)
    const first = screen.getByTestId('about-entity')
    expect(first.textContent).toMatch(/^Boardly \(boardly\.online\) is a free real-time multiplayer board games website/)
    expect(first.textContent).toMatch(/English, Norwegian, Russian and Ukrainian/)
    expect(screen.getByText(/not boardly\.co, boardly\.ai or joinboardly\.com/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'support@boardly.online' })).toHaveAttribute('href', 'mailto:support@boardly.online')
  })
})
