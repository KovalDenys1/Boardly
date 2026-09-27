import type { Awaitable, Profile, TokenSet, User } from 'next-auth'
import type { UserinfoEndpointHandler } from 'next-auth/providers/oauth'

/**
 * Whether an OAuth provider vouches for the email address it returned (#1142).
 *
 * `events.linkAccount` used to write `emailVerified: new Date()` for every OAuth link,
 * and `callbacks.signIn` did the same on every returning sign-in, whatever the provider
 * said. Discord returns addresses its users never verified, and a link to a provider
 * account says nothing about a different address already on the Boardly account. Now
 * the address is marked verified only when the provider asserts it and it is the
 * account's own address; otherwise our own verification email is the way in.
 *
 * What each provider asserts, from its documentation (read 2026-09-25):
 * - Google: the ID token claim `email_verified`, "True if the user's email address has
 *   been verified; otherwise false" (developers.google.com/identity/openid-connect/openid-connect).
 * - Discord: the user object field `verified`, "whether the email on this account has
 *   been verified", with the `email` scope (docs.discord.com/developers/resources/user).
 * - GitHub: `/user` carries no verification flag; `GET /user/emails` (scope `user:email`,
 *   which the provider requests) lists every address with `verified`
 *   (docs.github.com/en/rest/users/emails). `withGitHubEmailVerification` adds it to the
 *   profile as `email_verified`.
 */

export type OAuthProviderId = 'google' | 'github' | 'discord'

/** The flag carried on the normalised profile from `profile()` to `events.linkAccount`. */
export const PROVIDER_EMAIL_VERIFIED = 'providerEmailVerified'

/** Reads the provider's own statement from its raw profile. Anything unclear is false. */
export function providerAssertsEmailVerified(provider: string, rawProfile: unknown): boolean {
  if (!rawProfile || typeof rawProfile !== 'object') return false
  const profile = rawProfile as Record<string, unknown>
  switch (provider) {
    case 'google':
      // A boolean in the ID token; accept the string form some older tokens used.
      return profile.email_verified === true || profile.email_verified === 'true'
    case 'discord':
      return profile.verified === true
    case 'github':
      return profile.email_verified === true
    default:
      return false
  }
}

/**
 * Wraps a provider's default `profile()` so the normalised user it returns also carries
 * `providerEmailVerified`. NextAuth hands that object to `events.linkAccount` as
 * `profile`; the adapter's `createUser` receives it too and ignores the extra key.
 */
export function withProviderEmailVerified<P>(
  provider: OAuthProviderId,
  defaultProfile: (profile: P, tokens: TokenSet) => Awaitable<User>
): (profile: P, tokens: TokenSet) => Promise<User> {
  return async (profile, tokens) => {
    const user = await defaultProfile(profile, tokens)
    return { ...user, [PROVIDER_EMAIL_VERIFIED]: providerAssertsEmailVerified(provider, profile) } as User
  }
}

/** The flag as `events.linkAccount` sees it on the normalised profile. */
export function readProviderEmailVerified(profile: unknown): boolean {
  return Boolean(
    profile && typeof profile === 'object' && (profile as Record<string, unknown>)[PROVIDER_EMAIL_VERIFIED] === true
  )
}

function normalise(email: unknown): string | null {
  return typeof email === 'string' && email.trim().length > 0 ? email.trim().toLowerCase() : null
}

/**
 * The one rule both writers follow: mark the account's address verified only when the
 * provider vouched for the address it returned and that address is the account's own.
 */
export function providerVerifiesAccountEmail(options: {
  providerVerified: boolean
  providerEmail: unknown
  accountEmail: unknown
}): boolean {
  const providerEmail = normalise(options.providerEmail)
  return options.providerVerified && providerEmail !== null && providerEmail === normalise(options.accountEmail)
}

interface GitHubEmail {
  email?: unknown
  verified?: unknown
}

/** Whether `email` is a verified address on the GitHub account behind `accessToken`. */
export async function githubEmailVerified(
  accessToken: string | undefined,
  email: unknown,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  const wanted = normalise(email)
  if (!accessToken || !wanted) return false
  try {
    const res = await fetchImpl('https://api.github.com/user/emails', {
      headers: { Authorization: `token ${accessToken}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return false
    const emails = (await res.json()) as unknown
    if (!Array.isArray(emails)) return false
    return emails.some((entry: GitHubEmail) => normalise(entry?.email) === wanted && entry?.verified === true)
  } catch {
    // Unknown is not verified; the sign-in itself goes on.
    return false
  }
}

/**
 * GitHub's userinfo step, unchanged, plus `email_verified` for the address it chose. The
 * default request stays in charge of picking the address (the public one, else the
 * primary), so sign-in behaves exactly as before; one extra call answers whether GitHub
 * verified it.
 */
export function withGitHubEmailVerification(
  defaultUserinfo: UserinfoEndpointHandler | string | undefined,
  fetchImpl: typeof fetch = fetch
): UserinfoEndpointHandler {
  const handler = typeof defaultUserinfo === 'object' ? defaultUserinfo : undefined
  const defaultRequest = handler?.request
  return {
    ...handler,
    url: handler?.url ?? (typeof defaultUserinfo === 'string' ? defaultUserinfo : 'https://api.github.com/user'),
    async request(context) {
      if (!defaultRequest) {
        throw new Error('GitHub provider has no default userinfo request to wrap')
      }
      const profile = (await defaultRequest(context)) as Profile & Record<string, unknown>
      profile.email_verified = await githubEmailVerified(context.tokens.access_token, profile.email, fetchImpl)
      return profile
    },
  }
}
