'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { trackDiscordCta, type AnalyticsGameType } from '@/lib/analytics'

/**
 * One line offered to a host who is still alone in the waiting room (#982, region #899).
 *
 * 92 % of the people who join a lobby are guests, so the site has no way to reach them
 * later; the Discord server is the only channel that does, and nothing pointed at it at
 * the moment it helps. It appears after a short wait rather than immediately, because a
 * host who has just created a lobby is still expecting the friend they sent the code to.
 *
 * No dismiss button: it disappears on its own the moment somebody joins.
 */
const ALONE_DELAY_MS = 20_000

interface WaitingRoomDiscordHintProps {
  /** When the waiting game was created — the timer is anchored to that, not to mount. */
  waitingSinceMs: number
  gameType?: AnalyticsGameType
}

export default function WaitingRoomDiscordHint({ waitingSinceMs, gameType }: WaitingRoomDiscordHintProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const elapsed = Date.now() - waitingSinceMs
    if (elapsed >= ALONE_DELAY_MS) {
      setVisible(true)
      return
    }
    const timer = setTimeout(() => setVisible(true), ALONE_DELAY_MS - elapsed)
    return () => clearTimeout(timer)
  }, [waitingSinceMs])

  if (!visible) return null

  return (
    <a
      href="/discord"
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackDiscordCta('waiting_room', gameType)}
      className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-semibold leading-snug text-bd-ink-muted transition-colors hover:text-bd-ink sm:px-4"
    >
      <span className="shrink-0 pt-0.5"><Icon name="chat" size={14} /></span>
      <span className="min-w-0">{t('game.ui.aloneDiscordHint')}</span>
    </a>
  )
}
