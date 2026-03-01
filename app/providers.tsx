'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { Toaster } from 'react-hot-toast'
import i18n, { availableLocales, defaultLocale } from '@/i18n'

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
