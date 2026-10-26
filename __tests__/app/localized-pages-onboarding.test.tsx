// @ts-nocheck

/**
 * #1394: /ru and /uk keep the onboarding modal, whose account step is where an
 * OAuth sign-up confirms 13+ and the Terms (#1135). Only the tour is left out
 * there: it walks /games, /lobby and /profile, and past /games those are
 * English pages behind a root-layout reload that ends it.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import Providers from '@/app/providers'
import { OnboardingModal } from '@/components/Onboarding/OnboardingModal'
import RuPageLocale from '@/components/i18n/RuPageLocale'
import en from '@/locales/en'
import ru from '@/locales/ru'

const startTour = jest.fn()
let accountSetup = { confirmAge: true, offerPublicProfile: false }

jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }) => <>{children}</>,
  useSession: () => ({ status: 'authenticated', data: { user: { id: 'u1' } } }),
  signOut: jest.fn(),
}))
jest.mock('@/contexts/ToastContext', () => ({ ToastProvider: ({ children }) => <>{children}</> }))
jest.mock('@/contexts/GuestContext', () => ({
  GuestProvider: ({ children }) => <>{children}</>,
  useGuest: () => ({ isGuest: false }),
}))
jest.mock('@/contexts/OnboardingContext', () => ({
  ...jest.requireActual('@/contexts/OnboardingContext'),
  OnboardingProvider: ({ children }) => <>{children}</>,
  useOnboarding: () => ({
    showModal: true,
    accountSetup,
    saveAccountSetup: jest.fn(),
    completeOnboarding: jest.fn(),
    skipOnboarding: jest.fn(),
    hideModal: jest.fn(),
  }),
}))
jest.mock('@/contexts/TourContext', () => ({
  TourProvider: ({ children }) => <>{children}</>,
  useTour: () => ({ isActive: false, startTour }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/components/GameIcon', () => ({ __esModule: true, default: () => <span /> }))
jest.mock('@/components/DeferredGlobalEffects', () => () => null)
jest.mock('@/components/AccountLanguageSync', () => ({ AccountLanguageSync: () => null }))
jest.mock('@/components/SignupAttribution', () => ({ SignupAttribution: () => null }))
jest.mock('@/components/BlockListCacheSync', () => ({ BlockListCacheSync: () => null }))
jest.mock('next/dynamic', () => (loader) => {
  const name = /Onboarding|Tour|toast/i.exec(String(loader))?.[0] ?? 'other'
  const Dynamic = () => <i data-testid={`dynamic-${name}`} />
  Dynamic.displayName = `Dynamic${name}`
  return Dynamic
})

describe('onboarding on /ru and /uk (#1394)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    accountSetup = { confirmAge: true, offerPublicProfile: false }
  })

  it('mounts the onboarding modal and the tour on a /ru page as on an English one', () => {
    render(<Providers pathLocale="ru"><div /></Providers>)
    expect(screen.getByTestId('dynamic-Onboarding')).toBeInTheDocument()
    expect(screen.getByTestId('dynamic-Tour')).toBeInTheDocument()
  })

  it('asks an unconfirmed account for 13+ and the Terms on /ru, and it cannot be skipped', () => {
    render(
      <RuPageLocale>
        <OnboardingModal />
      </RuPageLocale>
    )
    expect(screen.getByRole('checkbox', { name: new RegExp(ru.onboarding.account.ageTermsPrefix) })).not.toBeChecked()
    expect(screen.getByRole('button', { name: ru.onboarding.account.continue })).toBeDisabled()
  })

  it('does not offer the tour on /ru, and nothing there starts it', () => {
    accountSetup = { confirmAge: false, offerPublicProfile: false }
    render(
      <RuPageLocale>
        <OnboardingModal />
      </RuPageLocale>
    )
    expect(screen.getByRole('button', { name: ru.onboarding.quickStart })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: ru.onboarding.showMeAround })).not.toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) fireEvent.click(button)
    expect(startTour).not.toHaveBeenCalled()
  })

  it('still offers the tour on an English page', () => {
    accountSetup = { confirmAge: false, offerPublicProfile: false }
    render(<OnboardingModal />)
    fireEvent.click(screen.getByRole('button', { name: en.onboarding.showMeAround }))
    expect(startTour).toHaveBeenCalledTimes(1)
  })
})
