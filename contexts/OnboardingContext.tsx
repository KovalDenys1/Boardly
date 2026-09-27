'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { useGuest } from '@/contexts/GuestContext'
import { readLocal, writeLocal } from '@/lib/safe-storage'

const GUEST_ONBOARDING_KEY = 'boardly_onboarding'

/**
 * What the modal's first step, the account step, has to ask a signed-in account before
 * the game choice. Guests never see it.
 */
export interface OnboardingAccountSetup {
  /**
   * An account created through Google, GitHub or Discord that has not yet confirmed
   * being 13 or older (#1135). The step cannot be skipped while this is true.
   */
  confirmAge: boolean
  /** The profile is not public, so the step offers to open it; unticked by default (#1131). */
  offerPublicProfile: boolean
}

export type OnboardingAccountChoice = { ageConfirmed: boolean; profilePublic: boolean }

const NO_ACCOUNT_SETUP: OnboardingAccountSetup = { confirmAge: false, offerPublicProfile: false }

export function needsAccountStep(setup: OnboardingAccountSetup): boolean {
  return setup.confirmAge || setup.offerPublicProfile
}

interface OnboardingContextType {
  showModal: boolean
  accountSetup: OnboardingAccountSetup
  /** Saves the account step. Throws when the server did not take it. */
  saveAccountSetup: (choice: OnboardingAccountChoice) => Promise<void>
  completeOnboarding: () => Promise<void>
  skipOnboarding: () => Promise<void>
  /** Hides the modal without marking onboarding complete/skipped — used when handing off to the guided tour. */
  hideModal: () => void
}

type OnboardingStatus = {
  needsOnboarding: boolean
  needsAgeConfirmation?: boolean
  profileVisibility?: 'public' | 'friends' | 'private'
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const { isGuest } = useGuest()
  const pathname = usePathname()
  const [showModal, setShowModal] = useState(false)
  const [accountSetup, setAccountSetup] = useState<OnboardingAccountSetup>(NO_ACCOUNT_SETUP)

  // The account step belongs to a signed-in account. After a sign-out (the age step's own
  // way out) a guest's onboarding must not inherit it.
  useEffect(() => {
    if (status !== 'authenticated') setAccountSetup(NO_ACCOUNT_SETUP)
  }, [status])

  useEffect(() => {
    if (status === 'loading') return
    if (pathname.startsWith('/lobby/')) return

    if (status === 'authenticated') {
      fetch('/api/onboarding/status', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data: OnboardingStatus) => {
          setAccountSetup({
            confirmAge: data.needsAgeConfirmation === true,
            offerPublicProfile: data.profileVisibility !== undefined && data.profileVisibility !== 'public',
          })
          if (data.needsOnboarding) setShowModal(true)
        })
        .catch(() => {/* silently ignore — don't block the app */})
      return
    }

    if (isGuest) {
      const stored = readLocal(GUEST_ONBOARDING_KEY)
      if (!stored) setShowModal(true)
    }
  }, [status, isGuest, pathname])

  // Hide modal if user navigates into a lobby (e.g. via invite link)
  useEffect(() => {
    if (pathname.startsWith('/lobby/')) {
      setShowModal(false)
    }
  }, [pathname])

  const completeOnboarding = useCallback(async () => {
    // Close immediately on click — persisting the choice is fire-and-forget
    // background work, not something the dismiss action should block on.
    // Previously awaited the PATCH before closing, so on any network delay
    // the modal would silently sit there through the first click (looking
    // like the button did nothing) until it resolved.
    setShowModal(false)
    if (status === 'authenticated') {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
    } else {
      writeLocal(GUEST_ONBOARDING_KEY, 'completed')
    }
  }, [status])

  const skipOnboarding = useCallback(async () => {
    setShowModal(false)
    if (status === 'authenticated') {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      })
    } else {
      writeLocal(GUEST_ONBOARDING_KEY, 'skipped')
    }
  }, [status])

  const hideModal = useCallback(() => {
    setShowModal(false)
  }, [])

  const saveAccountSetup = useCallback(async (choice: OnboardingAccountChoice) => {
    const res = await fetch('/api/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'account',
        ageConfirmed: choice.ageConfirmed,
        profilePublic: choice.profilePublic,
      }),
    })
    if (!res.ok) throw new Error(`Saving the onboarding account step failed: ${res.status}`)
    // Answered: the step is not asked again if the modal reopens in this visit.
    setAccountSetup(NO_ACCOUNT_SETUP)
  }, [])

  return (
    <OnboardingContext.Provider
      value={{ showModal, accountSetup, saveAccountSetup, completeOnboarding, skipOnboarding, hideModal }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return ctx
}
