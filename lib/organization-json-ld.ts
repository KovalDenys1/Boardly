// The one Organization node for Boardly (#925). The root layout's WebSite
// publisher and the /about entity page both use it, so every page names the
// same @id and the same logo – two Organization nodes with different logos was
// the ambiguity #925 removes.

export const BOARDLY_URL = 'https://boardly.online'
export const ORGANIZATION_ID = `${BOARDLY_URL}/#organization`
export const SUPPORT_EMAIL = 'support@boardly.online'
export const GITHUB_REPO_URL = 'https://github.com/KovalDenys1/Boardly'

export const organizationNode = {
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
} as const
