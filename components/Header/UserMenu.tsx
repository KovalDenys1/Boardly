'use client'

import { Fragment } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { navigateToProfile } from '@/lib/profile-navigation'
import { UserAvatar } from './UserAvatar'

interface UserMenuProps {
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

const itemClassName = (focus: boolean) =>
  `flex w-full items-center rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
    focus ? 'bg-bd-card-warm text-bd-ink' : 'text-bd-ink-soft'
  }`

/** The desktop avatar opens Profile, Settings and Logout. */
export function UserMenu({ userName, userEmail, userImage }: UserMenuProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()

  const openProfileTab = (tab: 'profile' | 'settings') => navigateToProfile(router, pathname, { tab })

  const handleSignOut = async () => {
    await signOut({ redirect: false })
    router.replace('/')
  }

  return (
    <Menu as="div" className="relative">
      <MenuButton
        className="flex overflow-hidden rounded-full bg-bd-bg2 p-0.5 shadow-[inset_0_0_0_2px_var(--bd-ink)] transition-transform hover:scale-110 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50"
        aria-label={t('header.openUserMenu')}
        title={userName || t('header.profile')}
      >
        <UserAvatar
          image={userImage}
          userName={userName}
          userEmail={userEmail}
          className="h-9 w-9 bg-bd-lav text-(--bd-ink-on-accent)"
          textClassName="text-sm font-bold"
        />
      </MenuButton>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1 scale-[0.98]"
        enterTo="opacity-100 translate-y-0 scale-100"
        leave="transition ease-in duration-100"
        leaveFrom="opacity-100 translate-y-0 scale-100"
        leaveTo="opacity-0 translate-y-1 scale-[0.98]"
      >
        <MenuItems className="absolute right-0 z-50 mt-2 w-[200px] overflow-hidden rounded-[1.25rem] border-[1.5px] border-bd-line bg-(--bd-input-bg) p-1.5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] focus:outline-hidden">
          <div className="truncate px-3 pb-1.5 pt-1 text-xs font-semibold text-bd-ink-muted">{userName || userEmail}</div>
          <MenuItem>
            {({ focus }) => (
              <button type="button" onClick={() => openProfileTab('profile')} className={itemClassName(focus)}>
                {t('header.profile')}
              </button>
            )}
          </MenuItem>
          <MenuItem>
            {({ focus }) => (
              <button type="button" onClick={() => openProfileTab('settings')} className={itemClassName(focus)}>
                {t('header.settings')}
              </button>
            )}
          </MenuItem>
          <div className="my-1 h-px bg-bd-line" />
          <MenuItem>
            {({ focus }) => (
              <button type="button" onClick={handleSignOut} className={itemClassName(focus)}>
                {t('header.logout')}
              </button>
            )}
          </MenuItem>
        </MenuItems>
      </Transition>
    </Menu>
  )
}
