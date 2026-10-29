'use client'

import type { ReactNode } from 'react'
import { PageLocaleProvider } from '@/lib/page-locale'
import ru from '@/locales/ru'

export default function RuPageLocale({ children }: { children: ReactNode }) {
  return (
    <PageLocaleProvider locale="ru" translation={ru}>
      {children}
    </PageLocaleProvider>
  )
}
