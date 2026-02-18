'use client'

import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { Toaster } from 'react-hot-toast'
import SocialLoopListener from '@/components/SocialLoopListener'
import '@/i18n' // Initialize i18n

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath="/api/auth">
      <GuestProvider>
        <ToastProvider>
          <Toaster position="top-right" />
          <SocialLoopListener />
          {children}
        </ToastProvider>
      </GuestProvider>
    </SessionProvider>
  )
}
