'use client'

import type { ReactNode } from 'react'
import { useIsPlayApp } from '@/hooks/useIsPlayApp'

export function PurchaseOnly({ children }: { children: ReactNode }) {
  const inPlayApp = useIsPlayApp()
  if (inPlayApp) return null

  return (
    <span data-purchase-ui className="contents">
      {children}
    </span>
  )
}

export function PlayAppOnly({ children }: { children: ReactNode }) {
  return useIsPlayApp() ? <>{children}</> : null
}
