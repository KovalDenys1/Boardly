'use client'

import type { ReactNode } from 'react'
import { PageLocaleProvider } from '@/lib/page-locale'
import es from '@/locales/es'

export default function EsPageLocale({ children }: { children: ReactNode }) {
  return (
    <PageLocaleProvider locale="es" translation={es}>
      {children}
    </PageLocaleProvider>
  )
}
