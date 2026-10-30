/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import PrivacyNotice from '@/app/(site)/privacy/PrivacyNotice'
import TermsContent from '@/app/(site)/terms/TermsContent'

jest.mock('@/lib/i18n-helpers', () => {
  const { englishT } = require('../fixtures/english-t')
  return { useTranslation: () => ({ t: englishT, i18n: { language: 'en' } }) }
})
jest.mock('@/lib/db', () => ({ prisma: {} }))
jest.mock('@/lib/consent', () => ({ reopenGoogleConsentMessage: jest.fn() }))

function expectContentsMatchSections(container: HTMLElement) {
  const contents = screen.getByRole('navigation', { name: 'Contents' })
  const links = within(contents).getAllByRole('link')
  const sectionHeadings = Array.from(container.querySelectorAll('section > h2'))

  // One entry per section, in page order, each pointing at the section that carries its title.
  expect(links.map((link) => link.textContent)).toEqual(sectionHeadings.map((h2) => h2.textContent))
  for (const link of links) {
    const href = link.getAttribute('href') ?? ''
    expect(href).toMatch(/^#[a-z0-9-]+$/)
    const target = container.querySelector(href)
    expect(target).not.toBeNull()
    expect(target?.tagName).toBe('SECTION')
    expect(target?.querySelector('h2')?.textContent).toBe(link.textContent)
  }
  // Under the title, before the first section.
  const title = screen.getByRole('heading', { level: 1 })
  expect(title.compareDocumentPosition(contents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(contents.compareDocumentPosition(sectionHeadings[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

describe('privacy and terms contents lists (#1561)', () => {
  it('lists every privacy section, each link landing on its section', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    expectContentsMatchSections(container)
  })

  it('lists every terms section, each link landing on its section', () => {
    const { container } = render(<TermsContent seller={null} />)
    expectContentsMatchSections(container)
  })

  it('lists the seller section only when it is drawn', () => {
    const { container } = render(
      <TermsContent seller={{ name: 'Test Seller', address: 'Street 1, 8500 Narvik', email: 'seller@example.com' }} />
    )
    expectContentsMatchSections(container)
    expect(within(screen.getByRole('navigation', { name: 'Contents' })).getByRole('link', { name: 'Who we are' })).toBeInTheDocument()
  })

  it('keeps the account deletion anchor Google Play links to', () => {
    const { container } = render(<PrivacyNotice controller={null} />)
    expect(container.querySelector('#delete-account')).not.toBeNull()
  })
})
