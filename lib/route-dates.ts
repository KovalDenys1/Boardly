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
 * `/games` and `/guides` list from `lib/game-catalog.ts` and
 * `lib/guides-catalog.ts`; a catalog change bumps them here by hand.
 */
export const ROUTE_UPDATED = {
  '/': '2026-09-09',
  '/games': '2026-09-07',
  '/leaderboard': '2026-09-15',
  '/about': '2026-09-15',
  '/games/yahtzee': '2026-09-10',
  '/games/spy': '2026-09-10',
  '/games/tic-tac-toe': '2026-09-10',
  '/games/memory': '2026-09-10',
  '/games/connect-four': '2026-09-10',
  '/games/alias': '2026-09-10',
  '/games/rock-paper-scissors': '2026-09-10',
  '/guides': '2026-09-15',
  '/privacy': '2026-09-02',
  '/terms': '2026-06-20',
} as const satisfies Record<string, string>

export type DatedRoute = keyof typeof ROUTE_UPDATED

export function getRouteUpdated(path: DatedRoute): string {
  return ROUTE_UPDATED[path]
}
