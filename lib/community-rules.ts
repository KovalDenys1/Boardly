/**
 * The community rules (#1173) as lists of locale keys under `rules.*`.
 *
 * /rules and sections 4 and 5 of /terms both render these lists, so the page a
 * player reads and the Terms they agreed to can never name different rules or
 * different moderation actions. Pure constants with no imports, because both
 * pages render them in the browser.
 *
 * The rules are part of the Terms: a change to any `rules.*` text changes what
 * a Premium buyer agrees to, so it needs a TERMS_VERSION bump, and
 * __tests__/lib/legal-text-versions.test.ts fails until it gets one.
 */

/** What everyone is asked to do. */
export const COMMUNITY_RULES_KIND = ['respect', 'fair', 'private'] as const

/** What nobody may post, show or do, in chat, drawings, usernames, avatars, bios or play. */
export const COMMUNITY_RULES_BANNED = [
  'harassment',
  'hate',
  'sexual',
  'violence',
  'personalInfo',
  'spam',
  'cheating',
  'impersonation',
  'illegal',
  'attacks',
] as const

/**
 * What can happen after a breach. `kick` is the host's tool (a waiting lobby
 * only, and the player cannot rejoin, #1013); the rest are ours: `suspend` is the
 * Control Panel's suspension with a reason and an expiry, `close` its deletion.
 */
export const MODERATION_ACTIONS = ['remove', 'kick', 'suspend', 'close'] as const
