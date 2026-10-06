'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { readLocal, writeLocal } from '@/lib/safe-storage'
import { trackSignupPrompt } from '@/lib/analytics'

// v2: dismissal expires after 24h (v1 hid the nudge forever after one click).
const DISMISS_KEY = 'boardly:guest-conversion-dismissed:v2'
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000

function isDismissed(): boolean {
  const raw = readLocal(DISMISS_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS
}

interface GuestConversionNudgeProps {
  registerUrl: string
}

export default function GuestConversionNudge({ registerUrl }: GuestConversionNudgeProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!isDismissed()) {
        setVisible(true)
        trackSignupPrompt('shown')
      }
    } catch {
      // localStorage unavailable (SSR or privacy mode) — don't show
    }
  }, [])

  const dismiss = () => {
    trackSignupPrompt('dismissed')
    try {
      writeLocal(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-linear-to-br/srgb from-emerald-50 to-teal-50 p-4 shadow-xs dark:border-emerald-700/50 dark:from-emerald-900/20 dark:to-teal-900/20 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0"><Icon name="party" size={24} /></div>
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
              onClick={() => trackSignupPrompt('clicked')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors sm:text-sm"
            >
              <Icon name="sparkle" size={14} />
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
