import { ALL_GUIDES } from '@/lib/guides-catalog'

/**
 * Last content change (YYYY-MM-DD) of every indexable route that is not a
 * guide – the guides carry their own `updated` in `lib/guides-catalog.ts`.
 * `app/sitemap.ts` reads `lastModified` from here and nowhere else, so a
 * content change to one of these pages is a one-line bump in this map.
 *
 * Seeded on 2026-09-15 by one rule for every key: the last commit on
 * `origin/develop` that touched the route's own files – its `page.tsx` and the
 * components beside it, sub-routes such as `/lobbies` excluded
 * (`git log -1 --format=%cs -- app/<route>/*.tsx`). `/leaderboard` is dated by
 * this change because #922 changed what its HTML contains. No seed is older
 * than the date the sitemap advertised before #922, so no lastmod regresses.
 * `/games` and `/guides` are index pages: their date here is only the last
 * change to the index itself, and `getRouteUpdated` lifts it to the newest
 * page they list, so releasing a game or editing a guide moves the index's
 * lastmod without a second bump here. `/games` read 2026-09-07 for two weeks
 * after two games shipped on 2026-09-21 before this was derived.
 */
export const ROUTE_UPDATED = {
  '/': '2026-09-15',
  '/games': '2026-09-07',
  '/leaderboard': '2026-09-15',
  '/about': '2026-09-15',
  '/premium': '2026-09-15',
  '/games/yahtzee': '2026-09-15',
  '/games/spy': '2026-09-15',
  '/games/tic-tac-toe': '2026-09-15',
  '/games/memory': '2026-09-15',
  '/games/connect-four': '2026-09-15',
  '/games/alias': '2026-09-15',
  // #1043 added the guide link to the detail page, and the new guide to the
  // catalog the /guides index lists from.
  '/games/rock-paper-scissors': '2026-09-20',
  // Released by #873 on 2026-09-21, the day they became indexable.
  '/games/liars-party': '2026-09-21',
  '/games/sketch-and-guess': '2026-09-21',
  '/guides': '2026-09-20',
  '/privacy': '2026-09-02',
  '/terms': '2026-06-20',
} as const satisfies Record<string, string>

export type DatedRoute = keyof typeof ROUTE_UPDATED

const latest = (dates: readonly string[]): string =>
  // ISO days sort as strings.
  dates.reduce((newest, date) => (date > newest ? date : newest))

export function getRouteUpdated(path: DatedRoute): string {
  const own = ROUTE_UPDATED[path]
  if (path === '/games') {
    const children = Object.entries(ROUTE_UPDATED)
      .filter(([route]) => route.startsWith('/games/'))
      .map(([, date]) => date)
    return latest([own, ...children])
  }
  if (path === '/guides') return latest([own, ...ALL_GUIDES.map((guide) => guide.updated)])
  return own
}
