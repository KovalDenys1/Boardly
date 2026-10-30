/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import Header from '@/components/Header'

let mockPathname = '/auth/login'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => mockPathname,
}))
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }))
jest.mock('next/dynamic', () => () => function DynamicStub() { return null })
jest.mock('@/lib/profile-navigation', () => ({ useProfileNavigationTracking: () => {} }))
jest.mock('@/components/Header/HeaderNavigation', () => ({ HeaderNavigation: () => null }))
jest.mock('@/components/Header/HeaderActions', () => ({ HeaderActions: () => null }))

describe('the site header on the auth pages (#1559)', () => {
  it.each(['/auth/login', '/auth/register'])('shows the logo as a link home on %s', (path) => {
    mockPathname = path
    render(<Header />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'boardly' })).toHaveAttribute('href', '/')
  })
})
