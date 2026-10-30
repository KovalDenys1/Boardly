'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { readLocal, writeLocal } from '@/lib/safe-storage'
import { trackSignupPrompt, type AnalyticsGameType } from '@/lib/analytics'
import { markSignupFrom } from '@/lib/signup-attribution'

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
  gameType?: AnalyticsGameType
  lobbyCode?: string | null
  /** True when the end screen offers this game's replay, so the copy can name it. */
  hasReplay?: boolean
}

export default function GuestConversionNudge({ registerUrl, gameType, lobbyCode, hasReplay = false }: GuestConversionNudgeProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!isDismissed()) {
        setVisible(true)
        trackSignupPrompt('shown', { gameType, lobbyCode })
      }
    } catch {
      // localStorage unavailable (SSR or privacy mode) — don't show
    }
    // Once per mount: a prop change on the same end screen is not a second showing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismiss = () => {
    trackSignupPrompt('dismissed', { gameType, lobbyCode })
    try {
      writeLocal(DISMISS_KEY, String(Date.now()))
    } catch {
      // ignore
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="mt-6 rounded-2xl border border-bd-success-border bg-bd-success-bg p-4 shadow-xs sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0"><Icon name="party" size={24} /></div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-bd-ink text-sm sm:text-base">
            {t(hasReplay ? 'auth.guestConversion.headlineReplay' : 'auth.guestConversion.headline')}
          </p>
          <p className="mt-1 text-xs text-bd-success-text sm:text-sm">
            {t(hasReplay ? 'auth.guestConversion.bodyReplay' : 'auth.guestConversion.body')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={registerUrl}
              onClick={() => {
                trackSignupPrompt('clicked', { gameType, lobbyCode })
                markSignupFrom('guest_prompt')
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-bd-mint px-4 py-2 text-xs font-bold text-bd-ink-on-accent shadow-xs hover:bg-bd-mint-deep transition-colors sm:text-sm"
            >
              <Icon name="sparkle" size={14} />
              <span>{t('auth.guestConversion.cta')}</span>
            </a>
            <button
              onClick={dismiss}
              className="inline-flex items-center rounded-xl border border-bd-success-border bg-bd-card px-4 py-2 text-xs font-semibold text-bd-success-text hover:bg-bd-bg2 transition-colors sm:text-sm"
            >
              {t('auth.guestConversion.dismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
