import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { OnboardingModal } from '@/components/Onboarding/OnboardingModal'
import type { OnboardingAccountSetup } from '@/contexts/OnboardingContext'

const saveAccountSetup = jest.fn()
const skipOnboarding = jest.fn()
let accountSetup: OnboardingAccountSetup = { confirmAge: true, offerPublicProfile: true }

jest.mock('@/contexts/OnboardingContext', () => ({
  ...jest.requireActual('@/contexts/OnboardingContext'),
  useOnboarding: () => ({
    showModal: true,
    accountSetup,
    saveAccountSetup,
    completeOnboarding: jest.fn(),
    skipOnboarding,
    hideModal: jest.fn(),
  }),
}))

jest.mock('@/contexts/TourContext', () => ({
  useTour: () => ({ isActive: false, startTour: jest.fn() }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({ signOut: jest.fn() }))

jest.mock('@/components/GameIcon', () => ({
  __esModule: true,
  default: () => <span data-testid="game-icon" />,
}))

// Resolve keys against the real English locale, so the test reads the visible copy.
jest.mock('@/lib/i18n-helpers', () => {
  const en = require('@/locales/en').default
  return {
    useTranslation: () => ({
      t: (key: string) => {
        const value = key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
        return typeof value === 'string' ? value : key
      },
    }),
  }
})

describe('onboarding account step for an OAuth sign-up (#1135, #1131)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    saveAccountSetup.mockResolvedValue(undefined)
    accountSetup = { confirmAge: true, offerPublicProfile: true }
  })

  it('asks for age and the Terms in one box, with links to both documents', () => {
    render(<OnboardingModal />)

    const box = screen.getByRole('checkbox', { name: /I am 13 or older and accept the/ })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  it('cannot be skipped: no close button, no skip, Continue waits for the box', () => {
    render(<OnboardingModal />)

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('sends the confirmation, with the public profile left unticked by default', async () => {
    render(<OnboardingModal />)

    fireEvent.click(screen.getByRole('checkbox', { name: /I am 13 or older and accept the/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

    await waitFor(() =>
      expect(saveAccountSetup).toHaveBeenCalledWith({ ageConfirmed: true, profilePublic: false })
    )
  })

  it('offers only the public profile to an account that already confirmed, and can be skipped', () => {
    accountSetup = { confirmAge: false, offerPublicProfile: true }
    render(<OnboardingModal />)

    expect(screen.queryByRole('checkbox', { name: /I am 13 or older/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Make my profile public/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
