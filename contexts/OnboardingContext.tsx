'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useGuest } from '@/contexts/GuestContext'

const GUEST_ONBOARDING_KEY = 'boardly_onboarding'

interface OnboardingContextType {
  showModal: boolean
  completeOnboarding: () => Promise<void>
  skipOnboarding: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined)

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const { isGuest } = useGuest()
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    if (status === 'loading') return

    if (status === 'authenticated') {
      fetch('/api/onboarding/status', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data: { needsOnboarding: boolean }) => {
          if (data.needsOnboarding) setShowModal(true)
        })
        .catch(() => {/* silently ignore — don't block the app */})
      return
    }

    if (isGuest) {
      const stored = localStorage.getItem(GUEST_ONBOARDING_KEY)
      if (!stored) setShowModal(true)
    }
  }, [status, isGuest])

  const completeOnboarding = useCallback(async () => {
    if (status === 'authenticated') {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })
    } else {
      localStorage.setItem(GUEST_ONBOARDING_KEY, 'completed')
    }
    setShowModal(false)
  }, [status])

  const skipOnboarding = useCallback(async () => {
    if (status === 'authenticated') {
      await fetch('/api/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      })
    } else {
      localStorage.setItem(GUEST_ONBOARDING_KEY, 'skipped')
    }
    setShowModal(false)
  }, [status])

  return (
    <OnboardingContext.Provider value={{ showModal, completeOnboarding, skipOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding(): OnboardingContextType {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return ctx
}
