import { render, screen } from '@testing-library/react'
import Footer from '@/components/Footer'

// Resolve keys against the real English locale, with {{name}}-style
// interpolation, so the test checks the visible imprint line and not just that
// a key was requested.
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

describe('Footer imprint (#1163)', () => {
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

  it('renders no imprint while the seller variables are unset', () => {
    delete process.env[NAME_VAR]
    delete process.env[ADDRESS_VAR]

    const { container } = render(<Footer />)

    expect(container.querySelector('address')).toBeNull()
    expect(screen.queryByText(/Operated by/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'support@boardly.online' })).toBeNull()
  })

  it('renders no imprint with a name but no address', () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    delete process.env[ADDRESS_VAR]

    const { container } = render(<Footer />)

    expect(container.querySelector('address')).toBeNull()
    expect(screen.queryByText(/Ola Nordmann/)).toBeNull()
  })

  it('shows the operator, the address on one line and a mailto link on a row above the copyright', () => {
    process.env[NAME_VAR] = 'Ola Nordmann'
    process.env[ADDRESS_VAR] = 'Storgata 1|0155 Oslo'

    const { container } = render(<Footer />)

    const imprint = container.querySelector('address')
    expect(imprint).not.toBeNull()
    expect(screen.getByText('Operated by Ola Nordmann')).toBeInTheDocument()
    expect(screen.getByText('Storgata 1, 0155 Oslo')).toBeInTheDocument()

    const mail = screen.getByRole('link', { name: 'support@boardly.online' })
    expect(mail).toHaveAttribute('href', 'mailto:support@boardly.online')
    expect(imprint).toContainElement(mail)

    // Its own row: the copyright line is the next sibling, not a neighbour
    // inside the same flex row, so at 320 px the imprint wraps on its own.
    const copyrightRow = imprint?.nextElementSibling
    expect(copyrightRow?.textContent).toMatch(/All rights reserved/)
  })
})
