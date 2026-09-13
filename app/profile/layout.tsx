import type { Metadata } from 'next'

/**
 * The profile is behind authentication, so to a crawler it is a login redirect
 * or an empty shell — never something that can answer a query (#915). `follow`
 * stays on because the header links out of it to pages that should be crawled.
 *
 * A layout rather than the page, because the page is a client component and
 * those cannot export metadata. Same shape as `app/auth/layout.tsx`.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
