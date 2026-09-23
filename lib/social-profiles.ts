/**
 * Boardly's own social profiles – the one list both the Organization JSON-LD
 * `sameAs` and the footer read (#1091).
 *
 * Empty until the accounts exist. Add a profile by adding one line here, e.g.
 * `{ platform: 'tiktok', url: 'https://www.tiktok.com/@<handle>' }`; nothing else
 * needs editing. Never add a URL for an account Boardly does not control: a
 * `sameAs` pointing at someone else's handle claims the wrong entity (#886), and
 * while the list is empty the footer renders nothing for it.
 */

export type SocialPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'x'

export type SocialProfile = {
  platform: SocialPlatform
  /** Absolute https URL of the profile. */
  url: string
}

export const SOCIAL_PROFILES: readonly SocialProfile[] = []

/** Brand names, spelled the same in every locale. */
export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  x: 'X',
}
