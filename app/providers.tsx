'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { Toaster } from 'react-hot-toast'
import i18n, { availableLocales, defaultLocale } from '@/i18n'
import { applyThemeMode, DARK_MEDIA_QUERY, getStoredThemeMode } from '@/lib/theme'

const DeferredGlobalEffects = dynamic(
  () => import('@/components/DeferredGlobalEffects'),
  { ssr: false }
)

function isAvailableLocale(value: string): value is (typeof availableLocales)[number] {
  return (availableLocales as readonly string[]).includes(value)
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const persistedLanguage =
      localStorage.getItem('i18nextLng') || localStorage.getItem('language')

    if (!persistedLanguage) return

    const normalized = persistedLanguage.toLowerCase().split('-')[0]
    const nextLanguage = isAvailableLocale(normalized)
      ? normalized
      : defaultLocale

    if (i18n.language !== nextLanguage) {
      void i18n.changeLanguage(nextLanguage)
    }
  }, [])

  useEffect(() => {
    const applyStoredTheme = () => {
      applyThemeMode(getStoredThemeMode(window.localStorage))
    }

    applyStoredTheme()

    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY)
    const handleThemeChange = () => {
      if (getStoredThemeMode(window.localStorage) === 'system') {
        applyStoredTheme()
      }
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleThemeChange)
    } else {
      mediaQuery.addListener(handleThemeChange)
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleThemeChange)
      } else {
        mediaQuery.removeListener(handleThemeChange)
      }
    }
  }, [])

  return (
    <SessionProvider basePath="/api/auth">
      <GuestProvider>
        <ToastProvider>
          <Toaster position="top-right" />
          <DeferredGlobalEffects />
          {children}
        </ToastProvider>
      </GuestProvider>
    </SessionProvider>
  )
}
