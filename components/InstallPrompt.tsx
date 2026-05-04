'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

const DISMISS_KEY = 'boardly:pwa-install-dismissed:v1'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches
  const iosStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)

  return Boolean(mediaStandalone || iosStandalone)
}

export default function InstallPrompt() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isPrompting, setIsPrompting] = useState(false)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    setIsInstalled(isStandaloneDisplayMode())

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
    }

    const onAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
      localStorage.removeItem(DISMISS_KEY)
      setDismissed(false)
    }

    const media = window.matchMedia('(display-mode: standalone)')
    const onMediaChange = () => setIsInstalled(isStandaloneDisplayMode())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    media.addEventListener?.('change', onMediaChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      media.removeEventListener?.('change', onMediaChange)
    }
  }, [])

  const visible = useMemo(() => {
    return Boolean(!dismissed && !isInstalled && deferredPrompt)
  }, [deferredPrompt, dismissed, isInstalled])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    try {
      setIsPrompting(true)
      await deferredPrompt.prompt()
      const choice = await deferredPrompt.userChoice
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null)
      }
    } finally {
      setIsPrompting(false)
    }
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,calc(0.75rem+env(safe-area-inset-bottom)))] z-[70] sm:inset-x-auto sm:right-4 sm:bottom-[max(1rem,calc(1rem+env(safe-area-inset-bottom)))] sm:max-w-sm">
      <div
        className="rounded-2xl p-4 shadow-2xl"
        style={{
          background: 'var(--bd-card-warm)',
          border: '1.5px solid var(--bd-line)',
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'var(--bd-ink)', boxShadow: '3px 3px 0 var(--bd-coral)' }}
          >
            <span aria-hidden="true" style={{ fontWeight: 900, color: 'var(--bd-sun)', fontSize: 18 }}>B</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--bd-ink)' }}>{t('installPrompt.title')}</p>
            <p className="mt-1 text-xs" style={{ color: 'var(--bd-ink-soft)' }}>
              {t('installPrompt.description')}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                disabled={isPrompting}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-60"
                style={{ background: 'var(--bd-ink)' }}
              >
                {isPrompting ? t('installPrompt.installing') : t('installPrompt.install')}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-xl px-3 py-2 text-xs font-semibold transition"
                style={{
                  border: '1.5px solid var(--bd-line)',
                  color: 'var(--bd-ink-soft)',
                  background: 'var(--bd-bg2)',
                }}
              >
                {t('installPrompt.notNow')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
