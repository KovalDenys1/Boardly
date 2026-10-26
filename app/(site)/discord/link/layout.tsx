import type { Metadata } from 'next'

/** A step in the Discord linked-roles flow, with nothing for a search result (#1498). */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function DiscordLinkLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
