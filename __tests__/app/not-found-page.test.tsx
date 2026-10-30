/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import NotFound from '@/app/(site)/not-found'
import { guaranteedPx } from '../fixtures/tailwind-size'

jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }))
jest.mock('@/lib/i18n-helpers', () => {
  const { englishT } = require('../fixtures/english-t')
  return { useTranslation: () => ({ t: englishT }) }
})

describe('404 page (#1561)', () => {
  it('has one h1, and it says the page was not found', () => {
    render(<NotFound />)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent('Page not found')
  })

  it('does not say "Page not found" twice', () => {
    const { container } = render(<NotFound />)
    expect(container.textContent?.match(/page not found/gi)).toHaveLength(1)
  })

  it('draws its three actions at one height', () => {
    render(<NotFound />)
    const heights = [
      screen.getByRole('link', { name: 'Browse Lobbies' }),
      screen.getByRole('link', { name: 'Go Home' }),
      screen.getByRole('button', { name: 'Go Back' }),
    ].map((el) => guaranteedPx(el, 'height'))
    expect(heights[0]).toBeGreaterThanOrEqual(44)
    expect(heights).toEqual([heights[0], heights[0], heights[0]])
  })
})
