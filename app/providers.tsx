'use client'

import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { OnboardingModal } from '@/components/Onboarding/OnboardingModal'
import DeferredGlobalEffects from '@/components/DeferredGlobalEffects'
import { Toaster } from 'react-hot-toast'
import i18n from '@/i18n'
import { applyThemeMode } from '@/lib/theme'
import { getStoredAppearanceLocale } from '@/lib/appearance-preferences'

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const nextLanguage = getStoredAppearanceLocale(localStorage)

    if (i18n.language !== nextLanguage) {
      void i18n.changeLanguage(nextLanguage)
    }
  }, [])

  useEffect(() => {
    applyThemeMode('light')
  }, [])

  return (
    <SessionProvider basePath="/api/auth">
      <GuestProvider>
        <OnboardingProvider>
          <ToastProvider>
            <Toaster position="top-right" />
            <DeferredGlobalEffects />
            <OnboardingModal />
            {children}
          </ToastProvider>
        </OnboardingProvider>
      </GuestProvider>
    </SessionProvider>
  )
}
