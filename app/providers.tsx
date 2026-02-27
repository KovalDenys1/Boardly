'use client'

import dynamic from 'next/dynamic'
import { SessionProvider } from 'next-auth/react'
import { ToastProvider } from '@/contexts/ToastContext'
import { GuestProvider } from '@/contexts/GuestContext'
import { Toaster } from 'react-hot-toast'
import '@/i18n' // Initialize i18n

const DeferredGlobalEffects = dynamic(
  () => import('@/components/DeferredGlobalEffects'),
  { ssr: false }
)

export default function Providers({ children }: { children: React.ReactNode }) {
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
