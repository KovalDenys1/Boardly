'use client'

import { Icon } from '@/components/icons'
import { useTranslation } from '@/lib/i18n-helpers'
import { DISABLED_BUTTON, FOCUS_RING } from './types'

interface FriendsEmptyStateProps {
  canShare: boolean
  onShare: () => void
}

export default function FriendsEmptyState({ canShare, onShare }: FriendsEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <div className="px-4 pb-6 pt-4 sm:px-6 sm:pb-7">
      <div
        aria-hidden
        className="grid h-14 w-14 -rotate-6 place-items-center rounded-2xl border-2 border-bd-ink bg-bd-mint text-bd-ink-on-accent shadow-[3px_3px_0_var(--bd-ink)]"
      >
        <Icon name="handshake" size={28} />
      </div>
      <h3 className="mt-5 font-display text-2xl font-bold text-bd-ink">{t('profile.friends.noFriends')}</h3>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-bd-ink-soft">
        {t('profile.friends.emptyDescription')}
      </p>
      <button
        type="button"
        onClick={onShare}
        disabled={!canShare}
        className={`bd-btn bd-btn-primary mt-5 ${FOCUS_RING} ${DISABLED_BUTTON}`}
      >
        <Icon name="link" size={18} />
        {t('profile.friends.shareProfileLink')}
      </button>
    </div>
  )
}
