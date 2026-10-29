'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/i18n-helpers'
import { useLocalizedHref } from '@/lib/page-locale'
import { isNavItemActive, visibleNavItems } from '@/lib/site-nav'

interface HeaderNavigationProps {
  isAuthenticated: boolean
}

export function HeaderNavigation({ isAuthenticated }: HeaderNavigationProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const localize = useLocalizedHref()

  const navBtn = (active: boolean) =>
    `rounded-xl font-medium transition duration-150 ${
      active
        ? 'bg-bd-ink text-bd-bg'
        : 'text-bd-ink-soft hover:bg-bd-bg2 hover:text-bd-ink'
    }`

  const navStyle = { padding: 'clamp(6px, 0.6vh, 10px) clamp(8px, 0.7vw, 12px)', fontSize: 'clamp(12px, 0.85vw, 14px)' }

  return (
    <div className="hidden desk:flex" style={{ marginLeft: 'clamp(10px, 1.5vw, 28px)', gap: 'clamp(2px, 0.3vw, 6px)' }}>
      {visibleNavItems({ isAuthenticated }).map((item) => (
        <Link
          key={item.id}
          href={localize(item.href)}
          className={navBtn(isNavItemActive(item, pathname))}
          style={navStyle}
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </div>
  )
}
