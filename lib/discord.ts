/**
 * Where the Discord invite comes from.
 *
 * One resolver, read by both the `/discord` route and the footer, so the invite lives in a
 * single place instead of being pasted into every surface that links to it. The link the
 * site hands out is always `/discord`; only this file knows the invite behind it, which is
 * what makes rotating a leaked or expired invite a one-value change.
 *
 * `NEXT_PUBLIC_` because the footer is a client component: a server-only variable would
 * force the footer to fetch the value or to be rendered on the server, and neither buys
 * anything for a public invite link that ends up in the HTML either way.
 *
 * The literal invite is the fallback rather than an empty string, so a preview deployment
 * or a fresh clone with no env set still reaches the server instead of dead-ending.
 */
export const DEFAULT_DISCORD_INVITE_URL = 'https://discord.gg/fja8YKPqYS'

export function getDiscordInviteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_DISCORD_INVITE?.trim()
  return configured || DEFAULT_DISCORD_INVITE_URL
}
