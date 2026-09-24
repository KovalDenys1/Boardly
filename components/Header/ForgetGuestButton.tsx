'use client'

import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { showToast } from '@/lib/i18n-toast'

/** How long the second tap is accepted before the button falls back to its first state. */
export const FORGET_GUEST_CONFIRM_WINDOW_MS = 5000

interface ForgetGuestButtonProps {
  className?: string
  style?: CSSProperties
}

/**
 * "Forget me" for guests (#1129). Deleting is irreversible, so the first tap
 * only arms the button and the second, within a few seconds, deletes. The
 * confirmation lives in the button's own label rather than a dialog, so it
 * adds nothing to the layout around it.
 */
export function ForgetGuestButton({ className, style }: ForgetGuestButtonProps) {
  const router = useRouter()
  const { t } = useTranslation()
  const { forgetGuest } = useGuest()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (disarmTimer.current) clearTimeout(disarmTimer.current)
  }, [])

  const handleClick = async () => {
    if (busy) return

    if (!confirming) {
      setConfirming(true)
      disarmTimer.current = setTimeout(() => setConfirming(false), FORGET_GUEST_CONFIRM_WINDOW_MS)
      return
    }

    if (disarmTimer.current) clearTimeout(disarmTimer.current)
    setBusy(true)
    try {
      await forgetGuest()
      showToast.success('guest.forgetMeDone')
      router.replace('/')
    } catch (error) {
      const code = (error as { code?: string } | null)?.code
      showToast.error(code === 'GUEST_IN_ACTIVE_GAME' ? 'guest.forgetMeActiveGame' : 'guest.forgetMeFailed')
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-live="polite"
      title={t('guest.forgetMeHint')}
      className={className}
      style={style}
    >
      {confirming ? t('guest.forgetMeConfirm') : t('guest.forgetMe')}
    </button>
  )
}
