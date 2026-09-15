// The one Organization node for Boardly (#925). The root layout's WebSite
// publisher and the /about entity page both use it, so every page names the
// same @id and the same logo – two Organization nodes with different logos was
// the ambiguity #925 removes.
//
// #886 adds the WebSite node beside it. Both live here so the site-wide graph
// can be unit-tested without rendering the layout, the way #925 made /about's
// nodes testable.

export const BOARDLY_URL = 'https://boardly.online'
export const ORGANIZATION_ID = `${BOARDLY_URL}/#organization`
export const WEBSITE_ID = `${BOARDLY_URL}/#website`
export const SUPPORT_EMAIL = 'support@boardly.online'
export const GITHUB_REPO_URL = 'https://github.com/KovalDenys1/Boardly'

/**
 * "Boardly" alone is shared with at least four unrelated products (#886), so
 * the entity also carries the two-word form people use to mean this one.
 */
export const BOARDLY_ALTERNATE_NAME = 'Boardly Games'

/** Dimensions are the real ones of `public/brand/logo.png` and are asserted against the file. */
export const LOGO_URL = `${BOARDLY_URL}/brand/logo.png`
export const LOGO_WIDTH = 1120
export const LOGO_HEIGHT = 320

const ENTITY_DESCRIPTION =
  'Boardly is a free online board games website where friends play together in the browser in real time, with no download and no account required.'

/**
 * `sameAs` has one entry because GitHub is the only third-party profile Boardly
 * owns. The Discord invite rotates (`app/discord/route.ts` is a 302 for exactly
 * that reason) so it is not a stable identity URL, and there is no X account –
 * a `sameAs` pointing at a handle we do not control would claim the wrong
 * entity rather than confirm ours.
 */
export const organizationNode = {
  '@type': 'Organization',
  '@id': ORGANIZATION_ID,
  name: 'Boardly',
  alternateName: BOARDLY_ALTERNATE_NAME,
  description: ENTITY_DESCRIPTION,
  url: BOARDLY_URL,
  logo: {
    '@type': 'ImageObject',
    url: LOGO_URL,
    width: LOGO_WIDTH,
    height: LOGO_HEIGHT,
  },
  sameAs: [GITHUB_REPO_URL],
  contactPoint: {
    '@type': 'ContactPoint',
    email: SUPPORT_EMAIL,
    contactType: 'customer support',
    availableLanguage: ['en', 'no', 'ru', 'uk'],
  },
} as const

/**
 * The site itself, as a node Google can attach the brand to.
 *
 * No `potentialAction`/`SearchAction`: Google retired the sitelinks search box
 * in November 2024 and the markup no longer produces the feature, so a
 * SearchAction here would be markup for a result that cannot render. The site
 * has no site-wide search endpoint to point one at either.
 */
export const websiteNode = {
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  name: 'Boardly',
  alternateName: BOARDLY_ALTERNATE_NAME,
  description: ENTITY_DESCRIPTION,
  url: BOARDLY_URL,
  inLanguage: ['en', 'no', 'ru', 'uk'],
  publisher: { '@id': ORGANIZATION_ID },
} as const

/**
 * What the root layout embeds on every page: one `@graph` holding the WebSite
 * and the Organization it points at, instead of the Organization nested inside
 * the WebSite. Nested, the Organization was only ever reachable through the
 * WebSite; as siblings under one `@id` each, `/premium`'s `brand` reference and
 * `/about`'s `about` reference resolve against the same node.
 */
export const siteJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [websiteNode, organizationNode],
} as const
