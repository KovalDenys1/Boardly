'use client'

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import { signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useGuest } from '@/contexts/GuestContext'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'
import { useTranslation } from '@/lib/i18n-helpers'
import { useLocalizedHref } from '@/lib/page-locale'
import { navigateToProfile } from '@/lib/profile-navigation'
import { isNavItemActive, visibleNavItems } from '@/lib/site-nav'
import { BlockedPlayersButton } from './BlockedPlayersDialog'
import { ForgetGuestButton } from './ForgetGuestButton'
import { QuickSettingsRow } from './QuickSettingsRow'
import { UserAvatar } from './UserAvatar'

export const NAV_DRAWER_ID = 'site-nav-drawer'

export interface NavDrawerProps {
  open: boolean
  onClose: () => void
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

const focusRing = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep'
const outlineButton = `w-full rounded-xl border-[1.5px] border-bd-line bg-bd-bg px-4 py-3 text-[15px] font-semibold text-bd-ink ${focusRing}`
const quietButton = `w-full rounded-xl px-3 py-2 text-sm font-medium text-bd-ink-soft ${focusRing}`
const inkButton = `w-full rounded-xl border-[1.5px] border-bd-line bg-bd-ink px-4 py-3 text-[15px] font-bold text-bd-bg ${focusRing}`

export function NavDrawer({
  open,
  onClose,
  isAuthenticated,
  userName,
  userEmail,
  userImage,
}: NavDrawerProps) {
  const { t } = useTranslation()
  const localize = useLocalizedHref()
  const router = useRouter()
  const pathname = usePathname()
  const { isGuest, guestName, clearGuestMode } = useGuest()
  const isGuestSession = isGuest && !isAuthenticated

  const openProfileTab = (tab: 'profile' | 'settings') => {
    onClose()
    navigateToProfile(router, pathname, { tab })
  }

  const handleSignOut = async () => {
    onClose()
    await signOut({ redirect: false })
    router.replace('/')
  }

  const handleGuestExit = () => {
    onClose()
    clearGuestMode()
    router.replace('/')
  }

  return (
    <Dialog id={NAV_DRAWER_ID} open={open} onClose={onClose} transition className="relative z-drawer desk:hidden">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-bd-scrim backdrop-blur-xs transition duration-bd ease-out data-closed:opacity-0"
      />
      <DialogPanel
        transition
        className="nav-drawer fixed inset-y-0 right-0 flex w-[85vw] max-w-[360px] flex-col overflow-hidden border-l-[1.5px] border-bd-line bg-bd-bg shadow-[-8px_0_32px_rgba(31,27,22,0.12)] transition duration-bd ease-out data-closed:translate-x-full data-closed:opacity-0"
      >
        <div className="flex shrink-0 items-center justify-between border-b-[1.5px] border-bd-line px-5 py-4">
          <DialogTitle as="span" className="font-display text-xl font-extrabold tracking-[-0.01em] text-bd-ink">
            {/* i18n-allow: brand wordmark, identical in all four locales */}
            boardly
          </DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className={`flex rounded-lg p-1.5 text-bd-ink-muted transition-colors hover:bg-bd-bg2 ${focusRing}`}
            aria-label={t('common.close')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {(isAuthenticated || isGuestSession) && (
          <div className="shrink-0 border-b-[1.5px] border-bd-line px-5 py-3">
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => openProfileTab('profile')}
                className={`flex w-full items-center gap-3 rounded-[14px] bg-bd-card-warm px-3 py-2.5 text-left transition-colors hover:bg-bd-bg2 ${focusRing}`}
                aria-label={t('header.profile')}
              >
                <UserAvatar
                  image={userImage}
                  userName={userName}
                  userEmail={userEmail}
                  className="bg-bd-lav text-bd-ink-on-accent"
                  textClassName="font-bold"
                  style={{ width: 44, height: 44, fontSize: 18, flexShrink: 0 }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-bd-ink">{userName || t('common.error')}</span>
                  <span className="nav-drawer-user-email mt-px block truncate text-xs text-bd-ink-soft">{userEmail}</span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" className="shrink-0 text-bd-ink-muted" aria-hidden>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-[14px] bg-bd-card-warm px-3 py-2.5">
                <UserAvatar image={null} userName={guestName} userEmail={null} style={{ width: 44, height: 44, fontSize: 18, flexShrink: 0 }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-bd-ink">{guestName || t('guest.playAsGuest')}</span>
                  <span className="nav-drawer-user-email mt-px block text-xs text-bd-ink-soft">{t('header.guestSession')}</span>
                </span>
              </div>
            )}
          </div>
        )}

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-4 py-3">
          {visibleNavItems({ isAuthenticated }).map((item) => {
            const active = isNavItemActive(item, pathname)
            return (
              <Link
                key={item.id}
                href={localize(item.href)}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`nav-drawer-link flex w-full items-center gap-3 rounded-xl text-[15px] font-semibold transition-colors ${
                  active ? 'bg-bd-sun text-bd-ink-on-accent' : 'text-bd-ink-soft hover:bg-bd-bg2'
                } ${focusRing}`}
              >
                {t(item.labelKey)}
              </Link>
            )
          })}
        </nav>

        <QuickSettingsRow />

        <div className="nav-drawer-footer flex shrink-0 flex-col gap-2.5 border-t-[1.5px] border-bd-line bg-bd-bg2 px-5 py-4">
          {isAuthenticated ? (
            <>
              <div className="nav-drawer-footer-grid grid grid-cols-2 gap-2">
                <button type="button" onClick={() => openProfileTab('profile')} className={outlineButton}>
                  {t('header.profile')}
                </button>
                <button type="button" onClick={() => openProfileTab('settings')} className={outlineButton}>
                  {t('header.settings')}
                </button>
              </div>
              <button type="button" onClick={handleSignOut} className={inkButton}>
                {t('header.logout')}
              </button>
            </>
          ) : isGuestSession ? (
            <>
              <button type="button" onClick={() => router.push(buildCurrentAuthUrl('login'))} className={outlineButton}>
                {t('header.login')}
              </button>
              <button type="button" onClick={handleGuestExit} className={inkButton}>
                {t('header.exitGuest')}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <BlockedPlayersButton className={quietButton} />
                <ForgetGuestButton onDone={onClose} className={quietButton} />
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => router.push(buildCurrentAuthUrl('login'))} className={outlineButton}>
                {t('header.login')}
              </button>
              <button
                type="button"
                onClick={() => router.push(buildCurrentAuthUrl('register'))}
                className={`${inkButton} border-none shadow-[0_4px_0_var(--bd-coral)]`}
              >
                {t('header.signUp')}
              </button>
            </>
          )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
