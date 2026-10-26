'use client'

import type { KeyboardEvent } from 'react'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useGuest } from '@/contexts/GuestContext'
import { Icon } from '@/components/icons'
import { navigateToProfile } from '@/lib/profile-navigation'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { guestMenuButtonClass, headerControl } from './headerControlStyles'

/** The guest menu's box and name while its code loads, so the header does not shift when it arrives. */
function GuestMenuPlaceholder() {
  const { t } = useTranslation()
  const { guestName } = useGuest()
  return (
    <span aria-hidden className={guestMenuButtonClass}>
      <Icon name="user" size={14} />
      <span className="truncate">{guestName ?? t('header.guestSession')}</span>
    </span>
  )
}

// A guest is only known in the browser, so the menu never rendered on the server; its Popover
// and dialogs stay out of every page's first load.
const GuestMenu = dynamic(() => import('./GuestMenu').then((mod) => mod.GuestMenu), {
  ssr: false,
  loading: () => <GuestMenuPlaceholder />,
})

interface HeaderActionsProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

export function HeaderActions({ isAuthenticated, userName, userEmail, userImage }: HeaderActionsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { t } = useTranslation()
  const { isGuest } = useGuest()
  const [isGuestUiReady, setIsGuestUiReady] = useState(false)
  const isGuestSession = isGuestUiReady && isGuest && !isAuthenticated

  useEffect(() => {
    setIsGuestUiReady(true)
  }, [])

  const handleProfileNavigation = () => {
    navigateToProfile(router, pathname)
  }

  const handleProfileTextKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleProfileNavigation()
    }
  }

  if (isGuestSession) {
    return (
      <div className="hidden desk:flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => router.push(buildCurrentAuthUrl('login'))}
          className={`${headerControl()} px-4 text-[15px] font-medium`}
        >
          {t('header.login')}
        </button>
        <GuestMenu />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="hidden desk:flex shrink-0 items-center gap-2">
        <ThemeToggle />
        <button
          type="button"
          onClick={() => router.push(buildCurrentAuthUrl('login'))}
          className={`${headerControl()} px-4 text-[15px] font-medium`}
        >
          {t('header.login')}
        </button>
        <button
          type="button"
          onClick={() => router.push(buildCurrentAuthUrl('register'))}
          className={`${headerControl({ border: 'border-bd-ink', surface: 'bg-bd-ink hover:bg-bd-ink-soft', text: 'text-bd-bg' })} px-4 text-[15px] font-semibold`}
        >
          {t('header.register')}
        </button>
      </div>
    )
  }

  return (
    <div className="hidden desk:flex items-center gap-2 min-w-0">
      <ThemeToggle />
      <span
        role="link"
        tabIndex={0}
        onClick={handleProfileNavigation}
        onKeyDown={handleProfileTextKeyDown}
        className="hidden 2xl:inline-block max-w-[120px] cursor-pointer truncate text-sm font-medium"
        style={{ color: 'var(--bd-ink)' }}
        title={userName || userEmail || t('header.profile')}
      >
        {userName || userEmail}
      </span>
      <UserMenu userName={userName} userEmail={userEmail} userImage={userImage} />
    </div>
  )
}
