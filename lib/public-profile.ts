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
