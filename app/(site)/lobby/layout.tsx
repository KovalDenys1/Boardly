import type { Metadata } from 'next'

/**
 * Covers `/lobby` and `/lobby/create` (#915). The list is empty most of the
 * time and stale the rest; the create page redirects a logged-out visitor to
 * `/`, so an indexable URL there is a search result that bounces the visitor
 * home. Neither is in `app/sitemap.ts`, but both are linked from the header on
 * every page, so they get crawled anyway.
 *
 * `/lobby/[code]` sets its own robots in its own layout and is unaffected —
 * a child's metadata replaces the parent's.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
