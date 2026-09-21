'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'

// One AdSense display slot, shown to free readers only.
//
// Three gates, all of which must open before an <ins> reaches the DOM:
//   1. NEXT_PUBLIC_ADS_ENABLED — the master switch. Vercel's Hobby plan forbids
//      commercial use and AdSense has not approved boardly.online yet, so this
//      stays unset until both are settled. Nothing ships to production until it is.
//   2. Client mount — the guides are static pages and must stay static, so the
//      slot renders nothing during SSR and decides on the client instead.
//   3. Premium — a paying account never sees an ad. Signed-out visitors and
//      guests are free by definition and skip the lookup entirely.
//
// The AdSense loader itself lives in app/layout.tsx and is site verification,
// not an ad; it can stay on regardless of this switch.

const AD_CLIENT = 'ca-pub-9471518400402044'

// Read inside the component, not at module load: Next inlines NEXT_PUBLIC_*
// wherever it appears, and a call site lets a test set the switch per case
// without resetting modules (which hands the component a second React).
function adsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ADS_ENABLED === 'true'
}

type PremiumState = 'unknown' | 'free' | 'premium'

interface AdSlotProps {
  /** data-ad-slot id from the AdSense console. */
  slot: string
  className?: string
}

export default function AdSlot({ slot, className }: AdSlotProps) {
  const enabled = adsEnabled()
  const { status } = useSession()
  const { t } = useTranslation()
  const [premium, setPremium] = useState<PremiumState>('unknown')
  const [unfilled, setUnfilled] = useState(false)
  const insRef = useRef<HTMLModElement | null>(null)
  const pushed = useRef(false)

  // Signed out or guest: free, no request. Signed in: ask, because the session
  // token carries no premium claim and a stale claim would show ads to a payer.
  useEffect(() => {
    if (!enabled) return
    if (status === 'loading') return
    if (status !== 'authenticated') {
      setPremium('free')
      return
    }

    let cancelled = false
    const controller = new AbortController()

    fetch('/api/user/purchases', { signal: controller.signal })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return
        setPremium(data?.isPremium ? 'premium' : 'free')
      })
      .catch(() => {
        // Unknown beats guessing: a failed lookup shows no ad rather than
        // risking one on a premium account.
        if (!cancelled) setPremium('unknown')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [enabled, status])

  const show = enabled && premium === 'free'

  // AdSense writes data-ad-status onto the <ins> once it has an answer. An
  // unfilled slot would otherwise leave a blank gap above the footer.
  const watchFill = useCallback((node: HTMLModElement | null) => {
    insRef.current = node
    if (!node) return

    const read = () => {
      const state = node.getAttribute('data-ad-status')
      if (state) setUnfilled(state === 'unfilled')
    }

    read()
    const observer = new MutationObserver(read)
    observer.observe(node, { attributes: true, attributeFilter: ['data-ad-status'] })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!show || pushed.current || !insRef.current) return
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] }
      w.adsbygoogle = w.adsbygoogle || []
      w.adsbygoogle.push({})
      pushed.current = true
    } catch {
      // Blocked loader or an ad blocker. Nothing to recover, leave the slot empty.
    }
  }, [show])

  if (!show) return null

  return (
    <div className={className} hidden={unfilled} aria-hidden={unfilled}>
      <p
        className="mb-2 text-center text-[11px] uppercase tracking-widest"
        style={{ color: 'var(--bd-ink-muted)' }}
      >
        {t('common.advertisement')}
      </p>
      <ins
        ref={watchFill}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
