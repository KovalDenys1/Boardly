'use client'

import { useEffect, useMemo, useState } from 'react'

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
    <div className="fixed inset-x-3 bottom-3 z-[70] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm">
      <div className="rounded-2xl border border-blue-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-blue-900/60 dark:bg-gray-900/95">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
            <span aria-hidden="true">▣</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Install Boardly</p>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
              Add Boardly to your home screen for faster launch and app-like navigation.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleInstall}
                disabled={isPrompting}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isPrompting ? 'Opening...' : 'Install'}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
