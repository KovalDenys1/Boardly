import type { Metadata } from 'next'

/** Shown only to a suspended account, so there is nothing here for a search result (#1498). */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function SuspendedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
