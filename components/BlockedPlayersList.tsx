'use client'

import { useId, useState } from 'react'
import { useBlockedPlayers } from '@/hooks/useBlockedPlayers'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'

interface BlockedPlayersListProps {
  /** Sizes the list; it scrolls itself once it is given a height (a max-height, or min-h-0 flex-1 in a column). */
  className?: string
}

/**
 * The viewer's blocked players with an Unblock for each (#1466): the profile's settings
 * section for an account, the guest menu's dialog for a guest.
 */
export default function BlockedPlayersList({ className = '' }: BlockedPlayersListProps) {
  const { t, i18n } = useTranslation()
  const { blocked, ready, unblock } = useBlockedPlayers()
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const listId = useId()

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString(i18n.language || undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const handleUnblock = async (id: string) => {
    if (pending.has(id)) return
    setPending((current) => new Set(current).add(id))
    const done = await unblock(id)
    setPending((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    if (!done) showToast.error('errors.generic')
  }

  if (!ready) {
    return (
      <p role="status" className={`text-sm text-bd-ink-soft ${className}`}>
        {t('common.loading')}
      </p>
    )
  }

  if (blocked.length === 0) {
    return <p className={`text-sm text-bd-ink-soft ${className}`}>{t('blockedPlayers.empty')}</p>
  }

  return (
    <ul className={`blocked-players-list custom-scrollbar divide-y divide-bd-line overflow-y-auto ${className}`}>
      {blocked.map((player) => {
        const nameId = `${listId}-${player.id}`
        return (
          <li key={player.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p id={nameId} className="truncate text-sm font-semibold text-bd-ink">
                {player.username}
              </p>
              <p className="text-xs text-bd-ink-soft">{t('blockedPlayers.blockedOn', { date: formatDate(player.blockedAt) })}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleUnblock(player.id)}
              disabled={pending.has(player.id)}
              aria-describedby={nameId}
              className="bd-btn bd-btn-soft shrink-0 rounded-xl px-3 py-1.5 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('blockedPlayers.unblock')}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
