export const REMEMBER_ME_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60

export function getCredentialsSessionMaxAgeSeconds(rememberMe: boolean): number {
  return rememberMe ? REMEMBER_ME_MAX_AGE_SECONDS : DEFAULT_SESSION_MAX_AGE_SECONDS
}
