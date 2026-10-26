import type { Metadata } from 'next'

/** Behind authentication, so there is nothing here for a search result (#915). */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function FriendsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
