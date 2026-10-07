'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import i18n from '@/i18n'
import { getStoredAppearanceLocale, normalizeAppearanceLocale } from '@/lib/appearance-preferences'
import { getSafeLocalStorage } from '@/lib/safe-storage'

const STORAGE_KEY = 'boardly_account_language'

let lastMarker: string | null = null

function readMarker(): string | null {
  const storage = getSafeLocalStorage()
  if (!storage) return lastMarker
  try {
    return storage.getItem(STORAGE_KEY)
  } catch {
    return lastMarker
  }
}

function writeMarker(marker: string | null) {
  lastMarker = marker
  try {
    const storage = getSafeLocalStorage()
    if (marker) storage?.setItem(STORAGE_KEY, marker)
    else storage?.removeItem(STORAGE_KEY)
  } catch {
    // storage is best-effort
  }
}

/**
 * Stores `language` on the account unless this sign-in already stored it. The marker carries
 * the sign-in time, so every new sign-in writes once and every switch after it writes once.
 */
export async function syncAccountLanguage(
  userId: string,
  signedInAt: number | null | undefined,
  language: string
): Promise<void> {
  const locale = normalizeAppearanceLocale(language)
  const marker = `${userId}:${signedInAt ?? 0}:${locale}`
  const previous = readMarker()
  if (previous === marker) return

  writeMarker(marker)
  try {
    const response = await fetch('/api/user/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: locale }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch {
    if (readMarker() === marker) writeMarker(previous)
  }
}

/** Keeps `Users.language` on the language the signed-in person reads the site in (#1331). */
export function AccountLanguageSync() {
  const { data: session, status } = useSession()
  const userId = status === 'authenticated' ? session?.user?.id : undefined
  const signedInAt = session?.user?.authenticatedAt ?? null

  useEffect(() => {
    if (!userId) return

    void syncAccountLanguage(userId, signedInAt, getStoredAppearanceLocale(getSafeLocalStorage() ?? undefined))

    const onLanguageChanged = (language: string) => {
      void syncAccountLanguage(userId, signedInAt, language)
    }
    i18n.on('languageChanged', onLanguageChanged)
    return () => {
      i18n.off('languageChanged', onLanguageChanged)
    }
  }, [userId, signedInAt])

  return null
}
