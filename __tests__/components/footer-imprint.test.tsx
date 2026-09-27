import { render, screen } from '@testing-library/react'
import Footer from '@/components/Footer'

// Resolve keys against the real English locale, with {{name}}-style
// interpolation, so a leftover translation call would still show real text
// rather than a raw key.
jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        const raw = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
        const text = typeof raw === 'string' ? raw : key
        return text.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? ''))
      },
    }),
  }
})

const NAME_VAR = 'NEXT_PUBLIC_SELLER_LEGAL_NAME'
const ADDRESS_VAR = 'NEXT_PUBLIC_SELLER_ADDRESS'

/**
 * The footer no longer carries an imprint (#1227): the operator's name and
 * home address show only on /terms, /privacy, /withdrawal and the Premium
 * purchase confirmation email, where the law actually asks for them - never
 * on a row that every crawled page on the site repeats.
 */
describe('Footer has no operator imprint (#1227)', () => {
  const originalName = process.env[NAME_VAR]
  const originalAddress = process.env[ADDRESS_VAR]

  afterEach(() => {
    if (originalName === undefined) {
      delete process.env[NAME_VAR]
    } else {
      process.env[NAME_VAR] = originalName
    }
    if (originalAddress === undefined) {
      delete process.env[ADDRESS_VAR]
    } else {
      process.env[ADDRESS_VAR] = originalAddress
    }
  })

  it('renders no address element and no operator name or address, even once both seller variables are set', () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'

    const { container } = render(<Footer />)

    expect(container.querySelector('address')).toBeNull()
    expect(screen.queryByText(/Ola Nordmann/)).toBeNull()
    expect(screen.queryByText(/Storgata 1/)).toBeNull()
    expect(screen.queryByText(/Operated by/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'support@boardly.online' })).toBeNull()
  })

  it('renders the same footer whether the seller variables are set or not', () => {
    delete process.env[NAME_VAR]
    delete process.env[ADDRESS_VAR]
    const { container: withoutSeller } = render(<Footer />)

    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'
    const { container: withSeller } = render(<Footer />)

    expect(withoutSeller.querySelector('address')).toBeNull()
    expect(withSeller.querySelector('address')).toBeNull()
  })
})
