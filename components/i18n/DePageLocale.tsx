'use client'

import type { ReactNode } from 'react'
import { PageLocaleProvider } from '@/lib/page-locale'
import de from '@/locales/de'

export default function DePageLocale({ children }: { children: ReactNode }) {
  return (
    <PageLocaleProvider locale="de" translation={de}>
      {children}
    </PageLocaleProvider>
  )
}
