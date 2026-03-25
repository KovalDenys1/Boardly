'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'

const SESSION_KEY = 'boardly_guest_upgrade_dismissed'

interface GuestConversionNudgeProps {
  registerUrl: string
}

export default function GuestConversionNudge({ registerUrl }: GuestConversionNudgeProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        setVisible(true)
      }
    } catch {
      // sessionStorage unavailable (SSR or privacy mode) — don't show
    }
  }, [])

  const dismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm dark:border-emerald-700/50 dark:from-emerald-900/20 dark:to-teal-900/20 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-2xl">🎉</div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-emerald-900 dark:text-emerald-100 text-sm sm:text-base">
            {t('auth.guestConversion.headline')}
          </p>
          <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300 sm:text-sm">
            {t('auth.guestConversion.body')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={registerUrl}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors sm:text-sm"
            >
              <span>✨</span>
              <span>{t('auth.guestConversion.cta')}</span>
            </a>
            <button
              onClick={dismiss}
              className="inline-flex items-center rounded-xl border border-emerald-200 bg-white/70 px-4 py-2 text-xs font-semibold text-emerald-700 hover:bg-white transition-colors dark:border-emerald-700/50 dark:bg-transparent dark:text-emerald-300 dark:hover:bg-emerald-900/20 sm:text-sm"
            >
              {t('auth.guestConversion.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
