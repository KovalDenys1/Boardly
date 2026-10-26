import type { TranslationKeys } from '@/lib/i18n-helpers'
import { unlocalizedPath } from '@/lib/seo-locales'

export type SiteNavAccess = 'public' | 'member'

export interface SiteNavItem {
  id: string
  labelKey: TranslationKeys
  href: string
  match: 'exact' | 'prefix'
  access: SiteNavAccess
}

/** The one list behind the desktop bar and the mobile drawer, in display order. */
export const SITE_NAV_ITEMS: readonly SiteNavItem[] = [
  { id: 'home', labelKey: 'header.home', href: '/', match: 'exact', access: 'public' },
  { id: 'games', labelKey: 'header.games', href: '/games', match: 'prefix', access: 'public' },
  { id: 'lobbies', labelKey: 'header.lobbies', href: '/lobby', match: 'prefix', access: 'public' },
  { id: 'leaderboard', labelKey: 'header.leaderboard', href: '/leaderboard', match: 'prefix', access: 'public' },
  { id: 'guides', labelKey: 'header.guides', href: '/guides', match: 'prefix', access: 'public' },
  { id: 'friends', labelKey: 'header.friends', href: '/friends', match: 'prefix', access: 'member' },
]

export function isNavItemActive(item: SiteNavItem, pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = unlocalizedPath(pathname)
  return item.match === 'exact' ? path === item.href : path.startsWith(item.href)
}

export function visibleNavItems(viewer: { isAuthenticated: boolean }): SiteNavItem[] {
  return SITE_NAV_ITEMS.filter((item) => item.access === 'public' || viewer.isAuthenticated)
}
