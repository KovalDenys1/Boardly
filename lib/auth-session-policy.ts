export const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

export function getCredentialsSessionMaxAgeSeconds(rememberMe: boolean): number {
  return rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : DEFAULT_SESSION_MAX_AGE_SECONDS
}

/**
 * How recent a sign-in must be before a session may do what a stolen session cookie must not
 * be able to do on its own: change the email of an account without a password (#1136), or
 * attach a Discord account, which is also a way to sign in (#1218). Measured from the token's
 * `authenticatedAt`, which lib/next-auth.ts sets on every sign-in.
 */
export const RECENT_SIGN_IN_WINDOW_MS = 10 * 60 * 1000

/**
 * True when `authenticatedAt` lies within RECENT_SIGN_IN_WINDOW_MS of `now`. A token without the
 * claim predates it and counts as signed in at 0, as in isBeforeSessionCutoff (lib/next-auth.ts).
 */
export function isRecentSignIn(authenticatedAt: number | null | undefined, now: number = Date.now()): boolean {
  const signedInAt =
    typeof authenticatedAt === 'number' && Number.isFinite(authenticatedAt) ? authenticatedAt : 0
  return now - signedInAt <= RECENT_SIGN_IN_WINDOW_MS
}
