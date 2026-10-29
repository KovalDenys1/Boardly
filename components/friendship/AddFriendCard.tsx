'use client'

import { type FormEvent, useId, useState } from 'react'
import { Icon } from '@/components/icons'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useTranslation } from '@/lib/i18n-helpers'
import { DISABLED_BUTTON, FOCUS_RING } from './types'

interface AddFriendCardProps {
  friendCode: string
  canCopyLink: boolean
  sending: boolean
  onSend: (input: string) => Promise<boolean>
  onCopyCode: () => void
  onCopyLink: () => void
  className?: string
}

export default function AddFriendCard({
  friendCode,
  canCopyLink,
  sending,
  onSend,
  onCopyCode,
  onCopyLink,
  className = '',
}: AddFriendCardProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const headingId = useId()
  const fieldId = useId()

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (await onSend(value)) setValue('')
  }

  return (
    <section aria-labelledby={headingId} className={`bd-card p-4 sm:p-6 ${className}`}>
      <h2 id={headingId} className="font-display text-xl font-bold text-bd-ink">
        {t('profile.friends.addFriend')}
      </h2>

      <form onSubmit={handleSubmit} noValidate className="mt-3">
        <label htmlFor={fieldId} className="block text-sm font-semibold text-bd-ink-soft">
          {t('profile.friends.addLabel')}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={fieldId}
            type="text"
            name="friend"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('profile.friends.addPlaceholder')}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            className="bd-input min-w-0 flex-[1_1_9rem] focus-visible:border-bd-lav-deep"
          />
          <button
            type="submit"
            disabled={sending}
            className={`bd-btn bd-btn-primary flex-[1_0_auto] justify-center ${FOCUS_RING} ${DISABLED_BUTTON}`}
          >
            {sending ? <LoadingSpinner size="sm" /> : <Icon name="plus" size={16} weight="bold" />}
            {t('profile.friends.sendRequest')}
          </button>
        </div>
      </form>

      {friendCode && (
        <div className="mt-5 border-t-[1.5px] border-dashed border-bd-line pt-4">
          <p className="text-sm font-semibold text-bd-ink-soft">{t('profile.friends.myFriendCode')}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-3">
            <span className="sr-only">{friendCode}</span>
            <span aria-hidden className="flex gap-1.5">
              {friendCode.split('').map((digit, index) => (
                <span
                  key={index}
                  className="grid h-11 w-9 place-items-center rounded-[10px] border-2 border-bd-ink bg-bd-sun font-display text-2xl font-extrabold tabular-nums text-bd-ink-on-accent shadow-[2px_2px_0_var(--bd-ink)]"
                >
                  {digit}
                </span>
              ))}
            </span>
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onCopyCode}
                className={`bd-btn bd-btn-soft justify-center ${FOCUS_RING}`}
              >
                <Icon name="copy" size={16} />
                {t('profile.friends.copyCode')}
              </button>
              <button
                type="button"
                onClick={onCopyLink}
                disabled={!canCopyLink}
                className={`bd-btn bd-btn-soft justify-center ${FOCUS_RING} ${DISABLED_BUTTON}`}
              >
                <Icon name="link" size={16} />
                {t('profile.friends.copyLink')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
