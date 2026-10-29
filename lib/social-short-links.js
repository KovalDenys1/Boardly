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
 *   /tt/connect-four, /tt/connect-four-trap -> /games/connect-four?...&utm_campaign=<campaign>
 *     (#1540: a campaign that starts with a game's slug lands on that game's page)
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
const SOCIAL_SHORT_LINK_CAMPAIGN_MAX = 32

/**
 * The `/games/<slug>` detail pages. A copy of the catalog's routes, because this
 * file cannot require the TypeScript catalog; the test holds it equal to them.
 */
const SOCIAL_SHORT_LINK_GAME_SLUGS = Object.freeze([
  'yahtzee',
  'spy',
  'tic-tac-toe',
  'memory',
  'connect-four',
  'alias',
  'liars-party',
  'rock-paper-scissors',
  'sketch-and-guess',
  'checkers',
  'ludo',
])

/**
 * @param {string} source
 * @param {string} campaign
 */
function socialShortLinkDestination(source, campaign, pathname = '/') {
  return `${pathname}?utm_source=${source}&utm_medium=${SOCIAL_SHORT_LINK_MEDIUM}&utm_campaign=${campaign}`
}

/**
 * The campaign pattern for one game: the slug alone, or the slug, a `-` or `_`
 * and a suffix, capped so the whole segment stays within the generic campaign's
 * length. The separator keeps `spy` from claiming `spyglass`.
 *
 * @param {string} slug
 */
function gameCampaignPattern(slug) {
  const suffixMax = SOCIAL_SHORT_LINK_CAMPAIGN_MAX - slug.length - 1
  return `${slug}(?:[-_][a-z0-9_-]{0,${suffixMax}})?`
}

/** Longest first, so a slug that extends another always wins. */
function gameSlugsLongestFirst() {
  return [...SOCIAL_SHORT_LINK_GAME_SLUGS].sort((a, b) => b.length - a.length)
}

/**
 * Per network, in order: a campaign starting with a game's slug goes to that
 * game's page, any other valid campaign segment is passed through to the home
 * page, and everything else under the path (the bare path included, since
 * `:rest*` matches zero segments) goes to the default campaign.
 */
function socialShortLinkRedirects() {
  return SOCIAL_SHORT_LINKS.flatMap(({ path, source }) => [
    ...gameSlugsLongestFirst().map((slug) => ({
      source: `${path}/:campaign(${gameCampaignPattern(slug)})`,
      destination: socialShortLinkDestination(source, ':campaign', `/games/${slug}`),
      permanent: false,
    })),
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
  SOCIAL_SHORT_LINK_GAME_SLUGS,
  socialShortLinkDestination,
  socialShortLinkRedirects,
  socialShortLinkDisallow,
}
