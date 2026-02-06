'use client'

import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { Toaster } from 'react-hot-toast'
import '@/i18n' // Initialize i18n

export default function Providers({ children }: { children: React.ReactNode }) {
  // Initialize i18n on client side
  useEffect(() => {
    // i18n is already initialized in the import above
  }, [])

  return (
    <SessionProvider>
      <GuestProvider>
        <ToastProvider>
          <Toaster position="top-right" />
          {children}
        </ToastProvider>
      </GuestProvider>
    </SessionProvider>
  )
}
