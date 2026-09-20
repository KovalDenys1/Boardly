'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { readLocal, writeLocal } from '@/lib/safe-storage'
import { showToast } from '@/lib/i18n-toast'
import { trackPushPrompt, type AnalyticsGameType, type PushPromptSource } from '@/lib/analytics'
import {
  getExistingPushSubscription,
  isPushConfigured,
  isPushSupported,
  subscribeAndRegisterPush,
} from '@/lib/push-subscription'

/**
 * The one place that asks for a return channel (#984).
 *
 * Push was built in #256 and had zero subscribers in production, because the only opt-in
 * was a checkbox on `/profile → Settings → Notifications` that a player has no reason to
 * open. This asks at the one moment the answer is obviously yes – a game has just finished
 * and the next one needs the other person to come back.
 *
 * It asks once. A browser grants the notification prompt once per origin and a refused
 * prompt is permanent, so every reason the ask could not work is checked *before* it is
 * rendered rather than after it is clicked.
 */

// v1: 30 days. Long, deliberately – the cost of re-asking too soon is a permanent denial,
// not an annoyed user.
const DISMISS_KEY = 'boardly:push-ask-dismissed:v1'
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000

function isDismissed(): boolean {
  // readLocal never throws (lib/safe-storage), which matters here: a private window makes
  // the property access itself throw, and that must hide the ask, not break the end screen.
  const raw = readLocal(DISMISS_KEY)
  if (!raw) return false
  const dismissedAt = Number(raw)
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_TTL_MS
}

export interface PushOptInNudgeProps {
  source: PushPromptSource
  gameType?: AnalyticsGameType
}

export default function PushOptInNudge({ source, gameType }: PushOptInNudgeProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    let cancelled = false

    // Every one of these means the ask cannot produce a subscription, so showing it would
    // spend the player's attention and, if clicked, the browser's one-shot prompt:
    //   - no VAPID key in this build: subscribing returns null and the row is never written
    //   - unsupported: iOS Safari outside an installed PWA has no PushManager at all
    //   - denied: the browser will not re-prompt; only site settings can undo it
    //   - dismissed: asked and refused inside the last 30 days
    if (!isPushConfigured() || !isPushSupported()) return
    if (Notification.permission === 'denied') return
    if (isDismissed()) return

    // The fifth case needs an await: this device may already be subscribed from the profile
    // toggle or an earlier game, in which case there is nothing to ask for.
    void getExistingPushSubscription()
      .then((existing) => {
        if (cancelled || !mounted.current || existing) return
        setVisible(true)
        trackPushPrompt('shown', source, gameType)
      })
      .catch(() => {
        // A service worker that will not resolve is the same answer as "cannot subscribe".
      })

    return () => {
      cancelled = true
      mounted.current = false
    }
  }, [source, gameType])

  const accept = useCallback(async () => {
    if (busy) return
    setBusy(true)

    // subscribeAndRegisterPush() reaches Notification.requestPermission() with nothing
    // awaited in front of it. Nothing may be imported dynamically or awaited here either:
    // browsers tie the prompt to the click that caused it and silently drop a late request.
    const result = await subscribeAndRegisterPush()

    if (result === 'registered') {
      // Subscribing alone delivers nothing. NotificationPreferences.pushNotifications
      // defaults to false and lib/push-send.ts returns before it ever reads the
      // subscriptions when it is, so the row we just wrote would be dead on arrival.
      try {
        await fetch('/api/user/notification-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pushNotifications: true }),
        })
      } catch {
        // The subscription exists; the preference is recoverable from /profile. Telling the
        // player their notifications are on is still true of the thing they just did.
      }
      trackPushPrompt('accepted', source, gameType)
      showToast.success('toast.pushEnabled')
    } else if (result === 'denied') {
      trackPushPrompt('denied', source, gameType)
    } else {
      showToast.error('profile.settings.notifications.pushUnavailable')
    }

    if (mounted.current) {
      setBusy(false)
      setVisible(false)
    }
  }, [busy, source, gameType])

  const dismiss = useCallback(() => {
    trackPushPrompt('dismissed', source, gameType)
    writeLocal(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }, [source, gameType])

  if (!visible) return null

  return (
    <div className="mt-2 w-full rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/70">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-slate-500 dark:text-slate-400">
          <Icon name="clock" size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {t('game.ui.pushAskHeadline')}
          </p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {t('game.ui.pushAskBody')}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void accept()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white sm:text-sm"
            >
              {t('game.ui.pushAskAccept')}
            </button>
            <button
              onClick={dismiss}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-white dark:border-slate-700/60 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800/60 sm:text-sm"
            >
              {t('game.ui.pushAskDismiss')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
