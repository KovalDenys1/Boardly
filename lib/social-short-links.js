/**
 * Short, typeable links for social posts (#1096).
 *
 * TikTok and Instagram comments and captions cannot hold a clickable link, so a
 * viewer types the address. A bare `boardly.online` arrives as `direct` and the
 * post gets no credit; `boardly.online/tt` lands on the same home page with UTM.
 *
 *   /tt            -> /?utm_source=tiktok.com&utm_medium=social&utm_campaign=profile
 *   /tt/<campaign> -> ...&utm_campaign=<campaign>   (`[a-z0-9_-]{1,32}`)
 *   /tt/<anything else> -> the default campaign, never a 404
 *
 * `utm_source` is the platform's canonical host from `lib/social-referrers.ts`
 * (#1091), not a bare name like `tiktok`, so a short-link visit (`utm:tiktok.com/…`)
 * and a referrer or in-app visit (`ref:tiktok.com`) show under the same source in
 * the Control Panel. Threads and Pinterest have no alias there yet; their hosts are
 * the ones their referrers carry today.
 *
 * The redirects are 307 (`permanent: false`): a path can be pointed somewhere else
 * later without browsers and the CDN holding the old target.
 *
 * CommonJS because `next.config.js` requires it; `app/robots.ts` and the tests
 * import it through `allowJs`.
 */

/** @type {ReadonlyArray<{ path: string, source: string }>} */
const SOCIAL_SHORT_LINKS = Object.freeze([
  { path: '/tt', source: 'tiktok.com' },
  { path: '/ig', source: 'instagram.com' },
  { path: '/yt', source: 'youtube.com' },
  { path: '/fb', source: 'facebook.com' },
  { path: '/th', source: 'threads.com' },
  { path: '/pin', source: 'pinterest.com' },
  { path: '/x', source: 'x.com' },
])

const SOCIAL_SHORT_LINK_MEDIUM = 'social'
const SOCIAL_SHORT_LINK_DEFAULT_CAMPAIGN = 'profile'
/** The path-to-regexp constraint on the campaign segment. */
const SOCIAL_SHORT_LINK_CAMPAIGN_PATTERN = '[a-z0-9_-]{1,32}'

/**
 * @param {string} source
 * @param {string} campaign
 */
function socialShortLinkDestination(source, campaign) {
  return `/?utm_source=${source}&utm_medium=${SOCIAL_SHORT_LINK_MEDIUM}&utm_campaign=${campaign}`
}

/**
 * Two rules per network, in order: a valid campaign segment is passed through,
 * and everything else under the path (the bare path included, since `:rest*`
 * matches zero segments) goes to the default campaign.
 */
function socialShortLinkRedirects() {
  return SOCIAL_SHORT_LINKS.flatMap(({ path, source }) => [
    {
      source: `${path}/:campaign(${SOCIAL_SHORT_LINK_CAMPAIGN_PATTERN})`,
      destination: socialShortLinkDestination(source, ':campaign'),
      permanent: false,
    },
    {
      source: `${path}/:rest*`,
      destination: socialShortLinkDestination(source, SOCIAL_SHORT_LINK_DEFAULT_CAMPAIGN),
      permanent: false,
    },
  ])
}

/**
 * robots.txt entries. Anchored, because robots paths are prefixes: a plain `/x`
 * would also block every future page whose path starts with an x.
 */
function socialShortLinkDisallow() {
  return SOCIAL_SHORT_LINKS.flatMap(({ path }) => [`${path}$`, `${path}/`])
}

module.exports = {
  SOCIAL_SHORT_LINKS,
  SOCIAL_SHORT_LINK_MEDIUM,
  SOCIAL_SHORT_LINK_DEFAULT_CAMPAIGN,
  SOCIAL_SHORT_LINK_CAMPAIGN_PATTERN,
  socialShortLinkDestination,
  socialShortLinkRedirects,
  socialShortLinkDisallow,
}
