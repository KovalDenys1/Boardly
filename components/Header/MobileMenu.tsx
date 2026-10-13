'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { useTranslation } from '@/lib/i18n-helpers'
import { NAV_DRAWER_ID, NavDrawer } from './NavDrawer'

interface MobileMenuProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
  onUnauthClick?: (dest: string) => void
}

const barClass = 'absolute left-0 h-[2.5px] w-full rounded-full bg-bd-ink transition-all duration-300'

export function MobileMenu({ isAuthenticated, userName, userEmail, userImage, onUnauthClick }: MobileMenuProps) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const isMobile = useIsMobileViewport()
  const [open, setOpen] = useState(false)
  const previousPathnameRef = useRef(pathname)
  const wasMobileRef = useRef(isMobile)

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return
    previousPathnameRef.current = pathname
    setOpen(false)
  }, [pathname])

  // A drawer left open across a resize past the desktop breakpoint would keep
  // the page scroll-locked behind an invisible dialog.
  useEffect(() => {
    if (wasMobileRef.current && !isMobile) setOpen(false)
    wasMobileRef.current = isMobile
  }, [isMobile])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`relative z-50 rounded-[10px] p-2 transition-colors duration-200 desk:hidden focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50 ${
          open ? 'bg-bd-bg2' : 'bg-transparent'
        }`}
        aria-label={open ? t('common.close') : t('header.menu')}
        aria-expanded={open}
        aria-controls={NAV_DRAWER_ID}
      >
        <span className="relative block h-6 w-6">
          <span className={barClass} style={{ top: open ? '50%' : 4, transform: open ? 'translateY(-50%) rotate(45deg)' : 'none' }} />
          <span className={barClass} style={{ top: '50%', transform: 'translateY(-50%)', opacity: open ? 0 : 1 }} />
          <span className={barClass} style={{ top: open ? '50%' : 17, transform: open ? 'translateY(-50%) rotate(-45deg)' : 'none' }} />
        </span>
      </button>

      <NavDrawer
        open={open}
        onClose={() => setOpen(false)}
        isAuthenticated={isAuthenticated}
        userName={userName}
        userEmail={userEmail}
        userImage={userImage}
        onUnauthClick={onUnauthClick}
      />
    </>
  )
}
