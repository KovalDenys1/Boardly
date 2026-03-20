export type AuthPage = 'login' | 'register'

type SearchParamsLike = {
  get(name: string): string | null
}

type LocationLike = {
  pathname: string
  search?: string
}

const DEFAULT_RETURN_URL = '/'
const AUTH_ROUTE_PREFIX = '/auth/'

export function sanitizeReturnUrl(
  returnUrl: string | null | undefined,
  fallback: string = DEFAULT_RETURN_URL
): string {
  if (typeof returnUrl !== 'string') {
    return fallback
  }

  const normalizedReturnUrl = returnUrl.trim()

  if (!normalizedReturnUrl || !normalizedReturnUrl.startsWith('/') || normalizedReturnUrl.startsWith('//')) {
    return fallback
  }

  return normalizedReturnUrl
}

export function resolveReturnUrlFromSearchParams(
  searchParams: SearchParamsLike | null | undefined,
  fallback: string = DEFAULT_RETURN_URL
): string {
  return sanitizeReturnUrl(
    searchParams?.get('returnUrl') ?? searchParams?.get('callbackUrl'),
    fallback
  )
}

export function buildAuthUrl(page: AuthPage, returnUrl?: string | null): string {
  const safeReturnUrl = sanitizeReturnUrl(returnUrl, DEFAULT_RETURN_URL)

  if (safeReturnUrl === DEFAULT_RETURN_URL) {
    return `/auth/${page}`
  }

  return `/auth/${page}?returnUrl=${encodeURIComponent(safeReturnUrl)}`
}

export function resolveReturnUrlFromLocation(locationLike: LocationLike): string {
  if (locationLike.pathname.startsWith(AUTH_ROUTE_PREFIX)) {
    return resolveReturnUrlFromSearchParams(
      new URLSearchParams(locationLike.search ?? ''),
      DEFAULT_RETURN_URL
    )
  }

  return sanitizeReturnUrl(
    `${locationLike.pathname}${locationLike.search ?? ''}`,
    DEFAULT_RETURN_URL
  )
}

export function buildCurrentAuthUrl(page: AuthPage): string {
  if (typeof window === 'undefined') {
    return buildAuthUrl(page)
  }

  return buildAuthUrl(page, resolveReturnUrlFromLocation(window.location))
}
