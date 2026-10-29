'use client'

import { useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import LoadingSpinner from './LoadingSpinner'
import { useOnlinePresence, mergeFriendPresence, sortFriendsByPresence } from '@/hooks/useFriendPresence'
import AddFriendCard from './friendship/AddFriendCard'
import FriendList from './friendship/FriendList'
import FriendRequestList from './friendship/FriendRequestList'
import FriendsEmptyState from './friendship/FriendsEmptyState'
import { useFriendsData } from './friendship/useFriendsData'
import { FOCUS_RING, type Friend } from './friendship/types'

interface FriendsProps {
  /** Called once the first screen is drawn, so a host can scroll to it without the page still growing. */
  onLoaded?: () => void
}

export default function Friends({ onLoaded }: FriendsProps = {}) {
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const verified = status === 'authenticated' && Boolean(session?.user?.emailVerified)
  const data = useFriendsData(verified)
  const onlineUserIds = useOnlinePresence()
  const ready = status === 'authenticated' && (!verified || !data.loading)

  useEffect(() => {
    if (ready) onLoaded?.()
  }, [ready, onLoaded])

  const presenceOf = useCallback(
    (friend: Friend) => mergeFriendPresence(friend.presence, onlineUserIds.has(friend.id)),
    [onlineUserIds]
  )

  if (status === 'authenticated' && !verified) {
    return (
      <section className="bd-card p-5 sm:p-7">
        <div
          aria-hidden
          className="grid h-12 w-12 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-sun text-bd-ink-on-accent shadow-[2px_2px_0_var(--bd-ink)]"
        >
          <Icon name="mail" size={24} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-bd-ink">
          {t('profile.friends.emailVerificationRequired')}
        </h2>
        <p className="mt-2 max-w-[52ch] text-bd-ink-soft">{t('profile.friends.emailVerificationRequiredDesc')}</p>
        <a href="/auth/verify-email" className={`bd-btn bd-btn-primary mt-5 ${FOCUS_RING}`}>
          {t('profile.friends.verifyEmail')}
        </a>
      </section>
    )
  }

  if (!verified || data.loading) {
    return (
      <div className="bd-card grid min-h-64 place-items-center">
        <LoadingSpinner />
      </div>
    )
  }

  const friends = sortFriendsByPresence(data.friends, presenceOf, (friend) => friend.username ?? '')

  return (
    <div className="grid gap-5 desk:grid-cols-[minmax(0,1fr)_22rem] desk:items-start desk:gap-6">
      <AddFriendCard
        className="desk:sticky desk:top-6 desk:col-start-2 desk:row-start-1"
        friendCode={data.friendCode}
        canCopyLink={Boolean(data.publicProfileId)}
        sending={data.sending}
        onSend={data.sendRequest}
        onCopyCode={() => void data.copyFriendCode()}
        onCopyLink={() => void data.copyProfileLink()}
      />

      <div className="grid min-w-0 gap-5 desk:col-start-1 desk:row-start-1 desk:gap-6">
        {data.received.length > 0 && (
          <FriendRequestList
            direction="received"
            requests={data.received}
            busyRequestId={data.busyRequestId}
            onAccept={(id) => void data.acceptRequest(id)}
            onReject={(id) => void data.rejectRequest(id)}
          />
        )}

        <FriendList
          friends={friends}
          presenceOf={presenceOf}
          loadFailed={data.loadFailed}
          onRetry={() => void data.refresh()}
          onRemove={(friendshipId) => void data.removeFriend(friendshipId)}
          empty={
            <FriendsEmptyState
              canShare={Boolean(data.publicProfileId)}
              onShare={() => void data.shareProfileLink(t('profile.friends.shareText'))}
            />
          }
        />

        {data.sent.length > 0 && <FriendRequestList direction="sent" requests={data.sent} />}
      </div>
    </div>
  )
}
