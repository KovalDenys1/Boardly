'use client'

import { Fragment } from 'react'
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/icons'
import { useGuest } from '@/contexts/GuestContext'
import { useTranslation } from '@/lib/i18n-helpers'
import { ForgetGuestButton } from './ForgetGuestButton'

const itemClassName =
  'flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-bd-ink-soft transition-colors hover:bg-bd-card-warm hover:text-bd-ink focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50 disabled:opacity-60'

/**
 * The guest's name opens Exit guest and Forget me. A Popover rather than a Menu
 * because Forget me arms on the first tap and deletes on the second (#1129), and a
 * Menu closes on the first.
 */
export function GuestMenu() {
  const { t } = useTranslation()
  const router = useRouter()
  const { guestName, clearGuestMode } = useGuest()

  const handleGuestExit = () => {
    clearGuestMode()
    router.replace('/')
  }

  return (
    <Popover as="div" className="relative">
      <PopoverButton
        className="inline-flex max-w-[140px] items-center gap-2 rounded-full border border-(--bd-sun-deep)/40 bg-(--bd-sun)/22 px-3 py-1.5 text-[13px] font-semibold text-bd-ink-soft transition-colors hover:bg-(--bd-sun)/35 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50"
        aria-label={t('header.guestSession')}
        title={guestName ?? t('header.guestSession')}
      >
        <Icon name="user" size={14} />
        <span className="truncate">{guestName ?? t('header.guestSession')}</span>
      </PopoverButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1 scale-[0.98]"
        enterTo="opacity-100 translate-y-0 scale-100"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 translate-y-0 scale-100"
        leaveTo="opacity-0 translate-y-1 scale-[0.98]"
      >
        <PopoverPanel className="absolute right-0 z-50 mt-2 w-[220px] overflow-hidden rounded-[1.25rem] border-[1.5px] border-bd-line bg-(--bd-input-bg) p-1.5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] focus:outline-hidden">
          <div className="truncate px-3 pb-1.5 pt-1 text-xs font-semibold text-bd-ink-muted">{t('header.guestSession')}</div>
          <button type="button" onClick={handleGuestExit} className={itemClassName}>
            {t('header.exitGuest')}
          </button>
          <ForgetGuestButton className={itemClassName} />
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}
