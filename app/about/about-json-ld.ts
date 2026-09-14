// Entity nodes for /about (#925). Kept out of page.tsx so the shape can be
// unit-tested without rendering the page.

export const BOARDLY_URL = 'https://boardly.online'
export const ABOUT_URL = `${BOARDLY_URL}/about`
export const SUPPORT_EMAIL = 'support@boardly.online'
export const GITHUB_REPO_URL = 'https://github.com/KovalDenys1/Boardly'

const ORGANIZATION_ID = `${BOARDLY_URL}/#organization`

export const ABOUT_DESCRIPTION =
  'Boardly (boardly.online) is a free real-time multiplayer board games website: Yahtzee, Guess the Spy, Tic-Tac-Toe, Connect Four, Memory, Alias and Rock Paper Scissors, played in the browser with friends via a shared link, no signup.'

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'Boardly',
  url: BOARDLY_URL,
  logo: `${BOARDLY_URL}/brand/logo.png`,
  sameAs: [GITHUB_REPO_URL],
  contactPoint: {
    '@type': 'ContactPoint',
    email: SUPPORT_EMAIL,
    contactType: 'customer support',
    availableLanguage: ['en', 'no', 'ru', 'uk'],
  },
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
