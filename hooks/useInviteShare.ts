'use client'

import { useCallback, useRef } from 'react'
import { showToast } from '@/lib/i18n-toast'
import { useTranslation } from '@/lib/i18n-helpers'
import { trackInviteCopied, type InviteCopySource } from '@/lib/analytics'
import { buildInviteSharePayload, shareInvite } from '@/lib/invite-share'

/**
 * The single invite affordance behind every share/copy button (#927).
 *
 * Every surface calls this rather than its own clipboard write, so the share marker, the
 * toast and the `invite_copied` event cannot drift apart between the lobby header, the
 * waiting room and the result overlay. `source` is the only thing a caller decides.
 */
export function useInviteShare(code: string | null | undefined) {
  const { t } = useTranslation()
  // A share sheet is modal and slow; a second tap while it is open must not open a second.
  const inFlight = useRef(false)

  const share = useCallback(
    async (source: InviteCopySource) => {
      if (!code || typeof window === 'undefined' || inFlight.current) return
      inFlight.current = true

      try {
        const payload = buildInviteSharePayload({
          code,
          origin: window.location.origin,
          title: t('game.ui.inviteShareTitle'),
          text: t('game.ui.inviteShareText'),
        })
        const outcome = await shareInvite({ payload, navigator: window.navigator })

        if (outcome === 'shared' || outcome === 'copied') {
          trackInviteCopied(source, code, outcome === 'shared' ? 'web_share' : 'clipboard')
        }
        // The share sheet is its own confirmation; only the silent clipboard needs a toast.
        if (outcome === 'copied') showToast.success('toast.linkCopied')
        if (outcome === 'failed') showToast.error('toast.error')
      } finally {
        inFlight.current = false
      }
    },
    [code, t]
  )

  return share
}
