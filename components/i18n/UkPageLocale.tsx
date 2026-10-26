'use client'

import type { ReactNode } from 'react'
import { PageLocaleProvider } from '@/lib/page-locale'
import uk from '@/locales/uk'

export default function UkPageLocale({ children }: { children: ReactNode }) {
  return (
    <PageLocaleProvider locale="uk" translation={uk}>
      {children}
    </PageLocaleProvider>
  )
}
