'use client'

import { useId } from 'react'
import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import FriendAvatar from './FriendAvatar'
import { formatRequestAge } from './request-age'
import { DISABLED_BUTTON, FOCUS_RING, type FriendRequest } from './types'

interface FriendRequestListProps {
  requests: FriendRequest[]
  direction: 'received' | 'sent'
  busyRequestId?: string | null
  onAccept?: (requestId: string) => void
  onReject?: (requestId: string) => void
}

/** Requests sent to the player, with Accept and Decline, or sent by them and still pending. */
export default function FriendRequestList({
  requests,
  direction,
  busyRequestId = null,
  onAccept,
  onReject,
}: FriendRequestListProps) {
  const { t, i18n } = useTranslation()
  const headingId = useId()
  const received = direction === 'received'

  return (
    <section aria-labelledby={headingId} className="bd-card overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id={headingId} className="font-display text-xl font-bold text-bd-ink">
          {received ? t('profile.friends.requestsTitle') : t('profile.friends.sentTitle')}
        </h2>
        <span className={`bd-chip ${received ? 'bd-chip-coral' : ''} px-2.5 py-0.5 tabular-nums`}>
          {requests.length}
        </span>
      </div>

      <ul className="mt-2 divide-y-[1.5px] divide-bd-line">
        {requests.map((request) => {
          const person = received ? request.sender : request.receiver
          const name = person?.username || '?'
          const busy = busyRequestId === request.id
          return (
            <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3.5 sm:px-6">
              <FriendAvatar name={name} src={person?.avatar} size={40} />
              <div className="min-w-0 flex-[1_1_7rem]">
                <p className="truncate font-semibold text-bd-ink">{name}</p>
                <p className="text-[13px] text-bd-ink-muted">{formatRequestAge(request.createdAt, i18n?.language)}</p>
              </div>
              {received ? (
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAccept?.(request.id)}
                    disabled={busy}
                    className={`bd-btn bd-btn-primary ${FOCUS_RING} ${DISABLED_BUTTON}`}
                  >
                    {t('profile.friends.accept')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject?.(request.id)}
                    disabled={busy}
                    aria-label={t('profile.friends.reject')}
                    title={t('profile.friends.reject')}
                    className={`bd-btn bd-btn-soft h-10 w-10 justify-center p-0! ${FOCUS_RING} ${DISABLED_BUTTON}`}
                  >
                    <Icon name="close" size={16} weight="bold" />
                  </button>
                </div>
              ) : (
                <span className="bd-chip bd-chip-sun">{t('profile.friends.pending')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
