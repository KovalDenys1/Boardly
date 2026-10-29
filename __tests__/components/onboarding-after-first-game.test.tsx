import { render, screen } from '@testing-library/react'
import { OnboardingModal } from '@/components/Onboarding/OnboardingModal'
import type { OnboardingAccountSetup } from '@/contexts/OnboardingContext'
import { noteFinishedGame, resetFinishedGameNote } from '@/lib/finished-game'

const skipOnboarding = jest.fn()
let accountSetup: OnboardingAccountSetup = { confirmAge: false, offerPublicProfile: false }

jest.mock('@/contexts/OnboardingContext', () => ({
  ...jest.requireActual('@/contexts/OnboardingContext'),
  useOnboarding: () => ({
    showModal: true,
    accountSetup,
    saveAccountSetup: jest.fn(),
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

describe('onboarding comes before the first game, or not at all (#1564)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetFinishedGameNote()
    accountSetup = { confirmAge: false, offerPublicProfile: false }
  })

  it('opens for a guest who has not played yet', () => {
    render(<OnboardingModal />)
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeInTheDocument()
    expect(skipOnboarding).not.toHaveBeenCalled()
  })

  it('does not open for a guest who has finished a game, and stays closed', () => {
    noteFinishedGame()
    render(<OnboardingModal />)
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(skipOnboarding).toHaveBeenCalledTimes(1)
  })

  it('still asks the account step that cannot be skipped, game or no game', () => {
    noteFinishedGame()
    accountSetup = { confirmAge: true, offerPublicProfile: false }
    render(<OnboardingModal />)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(skipOnboarding).not.toHaveBeenCalled()
  })

  it('gives Skip for now a target of at least 44 px', () => {
    render(<OnboardingModal />)
    const skip = screen.getByRole('button', { name: 'Skip for now' })
    expect(parseFloat(skip.style.minHeight)).toBeGreaterThanOrEqual(44)
  })
})
