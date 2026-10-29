'use client'

import type { ReactNode } from 'react'
import { PageLocaleProvider } from '@/lib/page-locale'
import no from '@/locales/no'

export default function NoPageLocale({ children }: { children: ReactNode }) {
  return (
    <PageLocaleProvider locale="no" translation={no}>
      {children}
    </PageLocaleProvider>
  )
}
