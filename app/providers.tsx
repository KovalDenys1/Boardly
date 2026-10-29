'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { SignupAttribution } from '@/components/SignupAttribution'
import { AccountLanguageSync } from '@/components/AccountLanguageSync'
import { BlockListCacheSync } from '@/components/BlockListCacheSync'
import { OnboardingProvider } from '@/contexts/OnboardingContext'
import { TourProvider } from '@/contexts/TourContext'
import DeferredGlobalEffects from '@/components/DeferredGlobalEffects'
import i18n, { changeLanguageLazy, type Locale } from '@/i18n'
import {
  getStoredAppearanceLocale,
  hasStoredAppearanceLocale,
  normalizeAppearanceLocale,
  setStoredAppearanceLocale,
} from '@/lib/appearance-preferences'
import { getSafeLocalStorage } from '@/lib/safe-storage'
import { pruneUnrememberedLastAccount } from '@/lib/last-account'
import type { PrefixedLocale } from '@/lib/seo-locales'

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

export default function Providers({
  children,
  pathLocale,
}: {
  children: React.ReactNode
  /** Set on /ru, /uk and /no pages, whose language is the URL's and not the visitor's stored choice (#1394). */
  pathLocale?: PrefixedLocale
}) {
  useEffect(() => {
    if (pathLocale) {
      const storage = getSafeLocalStorage()
      if (!hasStoredAppearanceLocale(storage ?? undefined)) setStoredAppearanceLocale(storage, pathLocale)
      return
    }
    const nextLanguage = getStoredAppearanceLocale(getSafeLocalStorage() ?? undefined) as Locale

    if (i18n.language !== nextLanguage) {
      void changeLanguageLazy(nextLanguage)
    }
  }, [pathLocale])

  // A last-account email saved before "Remember me" decided it (#1133) is removed on
  // the first page load, whether or not the person ever opens the login page again.
  useEffect(() => {
    pruneUnrememberedLastAccount()
  }, [])

  /**
   * Keep `<html lang>` on the language actually being rendered.
   *
   * An unprefixed page is served with `lang="en"`, because the server cannot know
   * the viewer's stored preference, and nothing updated it afterwards - so a
   * Russian-speaking player read a fully Russian site that claimed, permanently,
   * to be English. That is not cosmetic: a screen reader pronounces Russian with
   * English rules, the browser offers to translate a page already in the reader's
   * language, and hyphenation and font selection follow the wrong locale.
   *
   * A /ru, /uk or /no page gets its `lang` from the server and keeps it (#1394).
   */
  useEffect(() => {
    if (pathLocale) return
    const applyLanguageToDocument = (language: string) => {
      document.documentElement.lang = normalizeAppearanceLocale(language)
    }

    applyLanguageToDocument(i18n.language)
    i18n.on('languageChanged', applyLanguageToDocument)

    return () => {
      i18n.off('languageChanged', applyLanguageToDocument)
    }
  }, [pathLocale])

  return (
    <SessionProvider basePath="/api/auth">
      <GuestProvider>
        <SignupAttribution />
        <AccountLanguageSync />
        <BlockListCacheSync />
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
