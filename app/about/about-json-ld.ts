// Entity nodes for /about (#925). Kept out of page.tsx so the shape can be
// unit-tested without rendering the page. The Organization node itself lives
// in lib/organization-json-ld.ts because the root layout embeds it too.

import { BOARDLY_URL, ORGANIZATION_ID, organizationNode } from '@/lib/organization-json-ld'

export { BOARDLY_URL, GITHUB_REPO_URL, ORGANIZATION_ID, SUPPORT_EMAIL } from '@/lib/organization-json-ld'
export const ABOUT_URL = `${BOARDLY_URL}/about`

export const ABOUT_DESCRIPTION =
  'Boardly (boardly.online) is a free real-time multiplayer board games website: Yahtzee, Guess the Spy, Tic-Tac-Toe, Connect Four, Memory, Alias and Rock Paper Scissors, played in the browser with friends via a shared link, no signup.'

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  ...organizationNode,
}

export const aboutPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  name: 'About Boardly',
  url: ABOUT_URL,
  description: ABOUT_DESCRIPTION,
  inLanguage: 'en',
  about: { '@id': ORGANIZATION_ID },
  publisher: { '@id': ORGANIZATION_ID },
}
