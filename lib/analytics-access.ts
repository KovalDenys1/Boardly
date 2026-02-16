export interface AnalyticsIdentity {
  id?: string | null
  email?: string | null
}

function parseCsvSet(raw: string | undefined, { lowerCase = false }: { lowerCase?: boolean } = {}): Set<string> {
  if (!raw) return new Set()

  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => (lowerCase ? value.toLowerCase() : value))
  )
}

/**
 * Determines whether a user can access product analytics.
 *
 * Access rules:
 * - If ANALYTICS_ALLOWED_USER_IDS / ANALYTICS_ALLOWED_EMAILS are configured:
 *   allow only listed users.
 * - If not configured:
 *   allow in development/test, deny in production.
 */
export function canAccessProductAnalytics(identity: AnalyticsIdentity): boolean {
  const allowedIds = parseCsvSet(process.env.ANALYTICS_ALLOWED_USER_IDS)
  const allowedEmails = parseCsvSet(process.env.ANALYTICS_ALLOWED_EMAILS, { lowerCase: true })

  const hasAllowlist = allowedIds.size > 0 || allowedEmails.size > 0
  if (!hasAllowlist) {
    return process.env.NODE_ENV !== 'production'
  }

  if (identity.id && allowedIds.has(identity.id)) {
    return true
  }

  if (identity.email && allowedEmails.has(identity.email.toLowerCase())) {
    return true
  }

  return false
}

