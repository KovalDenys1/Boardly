// @ts-nocheck

/**
 * #1394: the onboarding tour walks /games, /lobby and /profile, and only /games
 * has a /ru or /uk version, so from a localized page it would cross into the
 * English site, reload, lose its place and show the modal again. It waits for
 * the visitor's first English page instead.
 */

import { render, screen } from '@testing-library/react'
import Providers from '@/app/providers'

jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => <>{children}</>,
  useSession: () => ({ status: 'unauthenticated', data: null }),
}))
jest.mock('@/contexts/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/GuestContext', () => ({ GuestProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/OnboardingContext', () => ({ OnboardingProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/TourContext', () => ({ TourProvider: ({ children }) => <>{children}</> }))
jest.mock('@/components/DeferredGlobalEffects', () => () => null)
jest.mock('next/dynamic', () => (loader) => {
  const name = /Onboarding|Tour|toast/i.exec(String(loader))?.[0] ?? 'other'
  const Dynamic = () => <i data-testid={`dynamic-${name}`} />
  Dynamic.displayName = `Dynamic${name}`
  return Dynamic
})

describe('the onboarding tour on localized pages (#1394)', () => {
  it('is offered on an English page', () => {
    render(<Providers><div /></Providers>)
    expect(screen.queryByTestId('dynamic-Onboarding')).not.toBeNull()
    expect(screen.queryByTestId('dynamic-Tour')).not.toBeNull()
  })

  it('is not offered on a /ru page', () => {
    render(<Providers pathLocale="ru"><div /></Providers>)
    expect(screen.queryByTestId('dynamic-Onboarding')).toBeNull()
    expect(screen.queryByTestId('dynamic-Tour')).toBeNull()
  })
})
