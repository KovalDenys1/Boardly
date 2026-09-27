export const PUBLIC_PROFILE_ID_LENGTH = 12

const PUBLIC_PROFILE_ID_REGEX = new RegExp(`^[A-Za-z0-9]{${PUBLIC_PROFILE_ID_LENGTH}}$`)

function extractPublicProfileIdFromPathname(pathname: string): string | null {
  const match = pathname.match(new RegExp(`^/u/([A-Za-z0-9]{${PUBLIC_PROFILE_ID_LENGTH}})/?$`))
  return match?.[1] ?? null
}

export function isValidPublicProfileId(value: string): boolean {
  return PUBLIC_PROFILE_ID_REGEX.test(value.trim())
}

export function buildPublicProfilePath(publicProfileId: string): string {
  return `/u/${publicProfileId}`
}

export function extractPublicProfileId(input: string): string | null {
  const value = input.trim()

  if (!value) {
    return null
  }

  if (isValidPublicProfileId(value)) {
    return value
  }

  try {
    const url = new URL(value)
    return extractPublicProfileIdFromPathname(url.pathname)
  } catch {
    // Fall through to relative-path parsing.
  }

  if (value.startsWith('/')) {
    try {
      const url = new URL(value, 'https://boardly.local')
      return extractPublicProfileIdFromPathname(url.pathname)
    } catch {
      return null
    }
  }

  return extractPublicProfileIdFromPathname(`/${value.replace(/^\/+/, '')}`)
}

export type ProfileVisibilityValue = 'public' | 'friends' | 'private'

/** Who is looking at a profile, as far as its visibility setting cares. */
export type ProfileViewerRelation = 'self' | 'friend' | 'other'

/**
 * The visibility a profile actually has. A user with no `AccountPreferences` row is
 * an account from before #1131 and keeps the public profile it always had
 * (`LEGACY_ACCOUNT_PREFERENCES` in lib/account-preferences.ts).
 */
export function effectiveProfileVisibility(
  stored: ProfileVisibilityValue | null | undefined
): ProfileVisibilityValue {
  return stored ?? 'public'
}

/**
 * The one rule for who may see a profile (#1226): its owner always, everyone when it
 * is public, accepted friends when it is friends-only, nobody else when it is private.
 * The public profile page and the leaderboard's pictures both go through it.
 */
export function canViewProfile(
  visibility: ProfileVisibilityValue | null | undefined,
  relation: ProfileViewerRelation
): boolean {
  if (relation === 'self') return true
  const effective = effectiveProfileVisibility(visibility)
  if (effective === 'public') return true
  if (effective === 'friends') return relation === 'friend'
  return false
}

/** A user as a friends route selects them: enough to show a name and a picture. */
export type ProfileParty = {
  id: string
  username: string | null
  image?: string | null
  avatarUrl?: string | null
  accountPreferences?: { profileVisibility: ProfileVisibilityValue } | null
}

export type PresentedProfileParty<T extends ProfileParty> =
  | { visible: true; party: Omit<T, 'accountPreferences'> & { avatar: string | null } }
  | { visible: false; party: { username: string | null; avatar: null } }

/**
 * What a friends route may tell the caller about another user (#1226), by the same rule
 * as the profile page: the whole selection plus a resolved `avatar` when the caller may
 * see the profile, and otherwise the username with the default avatar, without the
 * picture or the internal id. `visible` tells the caller whether to drop other fields
 * that name the person, such as a request's `receiverId`.
 */
export function presentProfileParty<T extends ProfileParty>(
  party: T,
  relation: ProfileViewerRelation
): PresentedProfileParty<T> {
  const { accountPreferences, ...fields } = party
  if (canViewProfile(accountPreferences?.profileVisibility, relation)) {
    return { visible: true, party: { ...fields, avatar: fields.avatarUrl ?? fields.image ?? null } }
  }
  return { visible: false, party: { username: fields.username, avatar: null } }
}

/** Id of the Privacy section in the profile settings tab, and the hash that scrolls to it. */
export const PRIVACY_SETTINGS_SECTION_ID = 'privacy'

/** The profile settings tab, scrolled to its Privacy section. */
export const PRIVACY_SETTINGS_HREF = `/profile?tab=settings#${PRIVACY_SETTINGS_SECTION_ID}`
