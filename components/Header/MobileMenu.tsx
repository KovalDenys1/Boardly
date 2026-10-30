'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport'
import { useTranslation } from '@/lib/i18n-helpers'
import { NAV_DRAWER_ID, NavDrawer } from './NavDrawer'
import { headerControl } from './headerControlStyles'

interface MobileMenuProps {
  isAuthenticated: boolean
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

const barClass = 'absolute left-0 h-[2.5px] w-full rounded-full bg-bd-ink transition-[top,transform,opacity] duration-bd'

export function MobileMenu({ isAuthenticated, userName, userEmail, userImage }: MobileMenuProps) {
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

  // Past the desktop breakpoint an open drawer is invisible but still scroll-locks the page.
  useEffect(() => {
    if (wasMobileRef.current && !isMobile) setOpen(false)
    wasMobileRef.current = isMobile
  }, [isMobile])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        data-open={open ? '' : undefined}
        className={`${headerControl({ square: true, text: 'text-bd-ink' })} relative z-10 desk:hidden`}
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
      />
    </>
  )
}
