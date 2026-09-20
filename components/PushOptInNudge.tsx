'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
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

// A separate, much shorter window for an attempt that broke rather than one the player
// turned down. Without it a device that hits a 429 or a 5xx once is asked again at the end
// of every game forever; with the 30-day key it would instead be silenced for a month over
// a blip. A day is long enough for the outage to pass and short enough to stay an ask.
const RETRY_KEY = 'boardly:push-ask-failed:v1'
const RETRY_TTL_MS = 24 * 60 * 60 * 1000

function isWithinWindow(key: string, ttlMs: number): boolean {
  // readLocal never throws (lib/safe-storage), which matters here: a private window makes
  // the property access itself throw, and that must hide the ask, not break the end screen.
  const raw = readLocal(key)
  if (!raw) return false
  const at = Number(raw)
  return Number.isFinite(at) && Date.now() - at < ttlMs
}

function isDismissed(): boolean {
  return isWithinWindow(DISMISS_KEY, DISMISS_TTL_MS)
}

function isCoolingOffAfterFailure(): boolean {
  return isWithinWindow(RETRY_KEY, RETRY_TTL_MS)
}

/**
 * One player, one ask – even when the page has the component mounted several times.
 *
 * `MemoryGameBoard` renders its desktop, phone-landscape and mobile-tab boards in the same
 * tree and hides two of them with `display: none` (app/globals.css:2784, :2789, :2805,
 * :1933). That hides pixels and nothing else: React still mounts those subtrees and still
 * runs their effects, so three live copies of this component used to mean three
 * `push_prompt_shown` beacons per finished Memory game and a dismissal that closed only the
 * copy that was clicked. Whether a copy is the visible one is a CSS fact this component
 * cannot see, so it must not try to elect one – instead every copy renders the same
 * module-level state, and only the copy that opened it reports `shown`.
 */
type AskPhase = 'pending' | 'open' | 'closed'

let askPhase: AskPhase = 'pending'
const askListeners = new Set<() => void>()

function subscribeToAsk(listener: () => void): () => void {
  askListeners.add(listener)
  return () => {
    askListeners.delete(listener)
    // The store coordinates the copies alive on one end screen, and nothing beyond it. When
    // the last one goes the screen is gone, so the next finished game starts from `pending`
    // and the localStorage keys - not a stale `closed` - decide whether it may ask again.
    if (askListeners.size === 0) askPhase = 'pending'
  }
}

function getAskPhase(): AskPhase {
  return askPhase
}

/** The server render and the first client render must agree, so neither ever shows a box. */
function getServerAskPhase(): AskPhase {
  return 'pending'
}

function setAskPhase(next: AskPhase): void {
  if (askPhase === next) return
  askPhase = next
  for (const listener of askListeners) listener()
}

/** True only for the first copy to get here, which is the one that owns the `shown` beacon. */
function openAsk(): boolean {
  if (askPhase !== 'pending') return false
  setAskPhase('open')
  return true
}

/** Closes every copy at once. False if another copy already closed it. */
function closeAsk(): boolean {
  if (askPhase !== 'open') return false
  setAskPhase('closed')
  return true
}

/** Test-only: the store is module state, so a suite must be able to start each case clean. */
export function __resetPushAskStateForTests(): void {
  askPhase = 'pending'
}

export interface PushOptInNudgeProps {
  source: PushPromptSource
  gameType?: AnalyticsGameType
}

export default function PushOptInNudge({ source, gameType }: PushOptInNudgeProps) {
  const { t } = useTranslation()
  const phase = useSyncExternalStore(subscribeToAsk, getAskPhase, getServerAskPhase)
  // Per copy, and deliberately not in the store: the six guards below are about this
  // browser, but two of them (a dismissal written since, an existing subscription) can
  // differ between one mount and the next, and a copy that failed its own guards must stay
  // hidden even while a sibling has the ask open.
  const [eligible, setEligible] = useState(false)
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
    //   - cooling off: the last attempt broke, and retrying every game end is not an ask
    if (!isPushConfigured() || !isPushSupported()) return
    if (Notification.permission === 'denied') return
    if (isDismissed() || isCoolingOffAfterFailure()) return

    // The sixth case needs an await: this device may already be subscribed from the profile
    // toggle or an earlier game, in which case there is nothing to ask for.
    void getExistingPushSubscription()
      .then((existing) => {
        if (cancelled || !mounted.current || existing) return
        // openAsk() is false for the second and third copy on a Memory end screen. They
        // still render, because the store they read is now open – they just do not each
        // report a player who was asked once.
        if (openAsk()) {
          trackPushPrompt('shown', source, gameType)
        }
        setEligible(true)
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
      const prefsSaved = await fetch('/api/user/notification-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pushNotifications: true }),
      })
        .then((res) => res.ok)
        .catch(() => false)

      if (prefsSaved) {
        trackPushPrompt('accepted', source, gameType)
        showToast.success('toast.pushEnabled')
      } else {
        // The response was never read before the review: a 401 or a 500 here left the
        // preference false and still said "Notifications on", which is #983 one surface
        // along. `/profile → Settings → Notifications` re-runs both writes, and the
        // cool-off keeps this device askable without asking at every game end.
        writeLocal(RETRY_KEY, String(Date.now()))
        trackPushPrompt('failed', source, gameType)
        showToast.error('profile.settings.error')
      }
    } else if (result === 'denied') {
      trackPushPrompt('denied', source, gameType)
    } else if (result === 'failed') {
      // The browser subscribed and /api/push-subscriptions refused it - a 429 from its rate
      // limit, or a 5xx. subscribeAndRegisterPush() has already dropped the browser
      // subscription so this device is not left looking subscribed with no row behind it,
      // and the cool-off decides when to ask again. "Try again" is the honest copy here;
      // pushUnavailable would blame the build for a server that was briefly busy.
      writeLocal(RETRY_KEY, String(Date.now()))
      trackPushPrompt('failed', source, gameType)
      showToast.error('profile.settings.notifications.pushFailed')
    } else {
      // 'unavailable' or 'unsupported'. The mount guard already checked both, so reaching
      // here means the build or the browser changed under the open end screen.
      showToast.error('profile.settings.notifications.pushUnavailable')
    }

    if (mounted.current) {
      setBusy(false)
    }
    closeAsk()
  }, [busy, source, gameType])

  const dismiss = useCallback(() => {
    if (!closeAsk()) return
    trackPushPrompt('dismissed', source, gameType)
    writeLocal(DISMISS_KEY, String(Date.now()))
  }, [source, gameType])

  if (!eligible || phase !== 'open') return null

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
