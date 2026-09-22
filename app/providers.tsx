'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { SignupAttribution } from '@/components/SignupAttribution'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { TourProvider } from '@/contexts/TourContext'
import DeferredGlobalEffects from '@/components/DeferredGlobalEffects'
import i18n, { changeLanguageLazy, type Locale } from '@/i18n'
import { getStoredAppearanceLocale, normalizeAppearanceLocale } from '@/lib/appearance-preferences'
import { getSafeLocalStorage } from '@/lib/safe-storage'

const OnboardingModal = dynamic(
  () => import('@/components/Onboarding/OnboardingModal').then((mod) => mod.OnboardingModal),
  { ssr: false }
)
const TourOverlay = dynamic(
  () => import('@/components/Tour/TourOverlay').then((mod) => mod.TourOverlay),
  { ssr: false }
)
const GlobalToaster = dynamic(
  () => import('react-hot-toast').then((mod) => mod.Toaster),
  { ssr: false }
)

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const nextLanguage = getStoredAppearanceLocale(getSafeLocalStorage() ?? undefined) as Locale

    if (i18n.language !== nextLanguage) {
      void changeLanguageLazy(nextLanguage)
    }
  }, [])

  /**
   * Keep `<html lang>` on the language actually being rendered.
   *
   * `app/layout.tsx` hardcodes `lang="en"` because it is a server component
   * that cannot know the viewer's stored preference, and nothing updated it
   * afterwards - so a Russian-speaking player read a fully Russian site that
   * claimed, permanently, to be English. That is not cosmetic: a screen reader
   * pronounces Russian with English rules, the browser offers to translate a
   * page already in the reader's language, and hyphenation and font selection
   * follow the wrong locale.
   *
   * Path-based locales (#928) will move this decision to the server, where it
   * belongs. Until then the client is the only place that knows.
   */
  useEffect(() => {
    const applyLanguageToDocument = (language: string) => {
      document.documentElement.lang = normalizeAppearanceLocale(language)
    }

    applyLanguageToDocument(i18n.language)
    i18n.on('languageChanged', applyLanguageToDocument)

    return () => {
      i18n.off('languageChanged', applyLanguageToDocument)
    }
  }, [])

  return (
    <SessionProvider basePath="/api/auth">
      <GuestProvider>
        <SignupAttribution />
        <OnboardingProvider>
          <TourProvider>
            <ToastProvider>
              <GlobalToaster position="top-right" />
              <DeferredGlobalEffects />
              <OnboardingModal />
              <TourOverlay />
              {children}
            </ToastProvider>
          </TourProvider>
        </OnboardingProvider>
      </GuestProvider>
    </SessionProvider>
  )
}
