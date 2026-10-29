'use client'

import { createContext, useContext } from 'react'
import type { PrefixedLocale } from '@/lib/seo-locales'

export const PageLocaleContext = createContext<PrefixedLocale | null>(null)

/** The page's URL locale, or null on an unprefixed page. */
export function usePageLocale(): PrefixedLocale | null {
  return useContext(PageLocaleContext)
}
