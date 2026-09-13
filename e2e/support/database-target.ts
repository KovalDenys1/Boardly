/**
 * Which database the e2e suite is allowed to touch, decided by what it is
 * pointed at (#896).
 *
 * `playwright.config.ts` resolves two things independently: `baseURL` from
 * `E2E_BASE_URL`, and `DATABASE_URL` from `.env.local`. Until 2026-09-09 both
 * happened to name production, so the pair never had to agree. Once local
 * development moved to `boardly-dev` (#893) the default invocation became a
 * silent hazard: the browser drives production while the teardown deletes from
 * dev, where the test lobbies do not exist — and reports success. That is the
 * state #867 had to clean out of production by hand.
 *
 * Both project refs are public identifiers, not secrets: they are already in
 * `docs/DATABASE.md` and in every Supabase URL the client bundle ships.
 */

export const PRODUCTION_DB_REF = 'vamydthjlytrseqdpzqv'
export const DEV_DB_REF = 'inmvbxfflqeblynpktay'

export type E2ETarget = 'production' | 'preview' | 'local'

/** The Supabase project a connection string points at, or null if it names none. */
export function refFromDatabaseUrl(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null
  // Pooler: postgres://postgres.<ref>@aws-N-<region>.pooler.supabase.com
  // Direct: postgres://postgres@db.<ref>.supabase.co
  const pooled = databaseUrl.match(/postgres\.([a-z0-9]{16,})/i)
  if (pooled) return pooled[1].toLowerCase()
  const direct = databaseUrl.match(/@db\.([a-z0-9]{16,})\.supabase\./i)
  return direct ? direct[1].toLowerCase() : null
}

/** What the suite is pointed at. No `E2E_BASE_URL` means the dev server it starts itself. */
export function targetFromBaseUrl(baseUrl: string | undefined): E2ETarget {
  if (!baseUrl) return 'local'
  let host: string
  try {
    host = new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return 'local'
  }
  if (host === 'boardly.online' || host === 'www.boardly.online') return 'production'
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return 'local'
  // Everything else is a deployment that is not production — a Vercel preview,
  // which points at boardly-dev, or a branch alias.
  return 'preview'
}

export function expectedRefForTarget(target: E2ETarget): string {
  return target === 'production' ? PRODUCTION_DB_REF : DEV_DB_REF
}

/**
 * Returns the reason the pair must not be used, or null when they agree.
 * A refusal is always better than a run whose cleanup goes somewhere else.
 */
export function describeTargetMismatch(options: {
  baseUrl: string | undefined
  databaseUrl: string | undefined
}): string | null {
  const target = targetFromBaseUrl(options.baseUrl)
  const expected = expectedRefForTarget(target)
  const actual = refFromDatabaseUrl(options.databaseUrl)

  if (!actual) {
    return (
      `e2e: DATABASE_URL names no Supabase project, so the teardown has nowhere to clean up.\n` +
      `  target:   ${target}${options.baseUrl ? ` (${options.baseUrl})` : ''}\n` +
      `  expected: ${expected}`
    )
  }
  if (actual === expected) return null

  const named = actual === PRODUCTION_DB_REF ? 'production' : actual === DEV_DB_REF ? 'boardly-dev' : actual
  return (
    `e2e: refusing to run — the target and the database disagree (#896).\n` +
    `  target:   ${target}${options.baseUrl ? ` (${options.baseUrl})` : ''}\n` +
    `  database: ${named} (${actual})\n` +
    `  expected: ${expected}\n` +
    `\n` +
    `  The suite would create lobbies in one database and delete them from another,\n` +
    `  and the teardown would report success. To verify a release, run it with the\n` +
    `  production connection strings:\n` +
    `\n` +
    `    E2E_DB_ENV_FILE=.env.boardly-prod.local E2E_BASE_URL=https://boardly.online npm run test:e2e\n`
  )
}
