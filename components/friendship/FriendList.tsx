'use client'

import { type ReactNode, useId, useState } from 'react'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { Icon } from '@/components/icons'
import { getFriendPresenceLabel, type FriendPresence } from '@/hooks/useFriendPresence'
import { useTranslation } from '@/lib/i18n-helpers'
import { buildPublicProfilePath } from '@/lib/public-profile'
import FriendAvatar from './FriendAvatar'
import { FOCUS_RING, type Friend } from './types'

const PRESENCE_TONE: Record<FriendPresence, string> = {
  in_game: 'text-bd-lav-text',
  in_lobby: 'text-bd-sun-text',
  online: 'text-bd-mint-text',
  offline: 'text-bd-ink-muted',
}

interface FriendListProps {
  friends: Friend[]
  presenceOf: (friend: Friend) => FriendPresence
  loadFailed: boolean
  onRetry: () => void
  onRemove: (friendshipId: string) => void
  /** Shown in place of the list when there are no friends. */
  empty: ReactNode
}

export default function FriendList({ friends, presenceOf, loadFailed, onRetry, onRemove, empty }: FriendListProps) {
  const { t } = useTranslation()
  const headingId = useId()
  const [removing, setRemoving] = useState<Friend | null>(null)
  const onlineCount = friends.filter((friend) => presenceOf(friend) !== 'offline').length

  return (
    <section aria-labelledby={headingId} className="bd-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id={headingId} className="font-display text-xl font-bold text-bd-ink">
          {t('profile.friends.title')}
        </h2>
        {friends.length > 0 && (
          <span className="bd-chip px-2.5 py-0.5 tabular-nums">{friends.length}</span>
        )}
        {onlineCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-bd-mint-text">
            <span aria-hidden className="h-2 w-2 rounded-full bg-bd-mint-deep" />
            {t('profile.friends.onlineCount', { count: onlineCount })}
          </span>
        )}
      </div>

      {loadFailed && friends.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-5 pt-3 sm:px-6">
          <p className="flex-1 text-sm text-bd-ink-soft">{t('profile.friends.errors.loadFailed')}</p>
          <button type="button" onClick={onRetry} className={`bd-btn bd-btn-soft ${FOCUS_RING}`}>
            <Icon name="refresh" size={16} />
            {t('common.retry')}
          </button>
        </div>
      ) : friends.length === 0 ? (
        empty
      ) : (
        <ul className="mt-2 divide-y-[1.5px] divide-bd-line">
          {friends.map((friend) => {
            const name = friend.username || '?'
            const presence = presenceOf(friend)
            return (
              <li key={friend.friendshipId} className="flex items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
                <FriendAvatar name={name} src={friend.avatar} online={presence !== 'offline'} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-center gap-1.5">
                    {friend.publicProfileId ? (
                      <Link
                        href={buildPublicProfilePath(friend.publicProfileId)}
                        className={`truncate rounded-md font-semibold text-bd-ink underline-offset-2 hover:underline ${FOCUS_RING}`}
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold text-bd-ink">{name}</span>
                    )}
                    {friend.isPremium && (
                      <Icon name="crown" size={14} tone="premium" label={t('common.premium')} className="shrink-0" />
                    )}
                  </p>
                  <p className={`truncate text-[13px] font-medium ${PRESENCE_TONE[presence]}`}>
                    {getFriendPresenceLabel(presence, t) ?? t('profile.friends.presence.notOnline')}
                  </p>
                </div>
                <Link
                  href={`/lobby/create?invite=${encodeURIComponent(friend.id)}`}
                  aria-label={t('profile.friends.inviteToGame', { username: name })}
                  className={`bd-btn bd-btn-soft shrink-0 max-sm:px-3! ${FOCUS_RING}`}
                >
                  <span className="max-sm:hidden"><Icon name="gamepad" size={16} /></span>
                  {t('profile.friends.invite')}
                </Link>
                <button
                  type="button"
                  onClick={() => setRemoving(friend)}
                  aria-label={t('profile.friends.removeFriend', { username: name })}
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 text-bd-ink-muted transition-colors hover:bg-bd-bg2 hover:text-bd-coral-text ${FOCUS_RING}`}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmModal
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) onRemove(removing.friendshipId)
        }}
        title={t('profile.friends.removeConfirmTitle')}
        message={t('profile.friends.confirmRemove', { username: removing?.username || '?' })}
        confirmText={t('profile.friends.remove')}
        variant="danger"
        icon={<Icon name="trash" size={26} />}
      />
    </section>
  )
}
