import type { Metadata } from 'next'
import RulesContent from './RulesContent'

/**
 * The community rules (#1173): what is not allowed, how to report it, what
 * moderation can do and how to appeal. Sections 4 and 5 of /terms render the
 * same lists, and the rules are part of the Terms. The copy is client-rendered
 * through t() like /withdrawal, so the page itself stays static.
 */
export const metadata: Metadata = {
  title: 'Community Rules',
  description:
    'The Boardly community rules: what is not allowed in chat, drawings and profiles, how to report it, what moderation can do and how to appeal.',
  alternates: {
    canonical: 'https://boardly.online/rules',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RulesPage() {
  return <RulesContent />
}
