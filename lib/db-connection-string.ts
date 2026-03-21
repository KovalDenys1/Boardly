export interface NormalizeDatabaseUrlOptions {
  caCertPath?: string | null
}

function shouldEnableLibpqCompat(sslMode: string | null): boolean {
  return sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca'
}

export function normalizeRuntimeDatabaseUrl(
  rawDatabaseUrl: string,
  options: NormalizeDatabaseUrlOptions = {}
): string {
  const databaseUrl = new URL(rawDatabaseUrl)
  const caCertPath = options.caCertPath ?? null

  if (caCertPath) {
    if (!databaseUrl.searchParams.has('sslrootcert')) {
      databaseUrl.searchParams.set('sslrootcert', caCertPath)
    }

    databaseUrl.searchParams.set('sslmode', 'verify-full')
    databaseUrl.searchParams.delete('uselibpqcompat')

    return databaseUrl.toString()
  }

  const sslMode = databaseUrl.searchParams.get('sslmode')
  if (shouldEnableLibpqCompat(sslMode) && !databaseUrl.searchParams.has('uselibpqcompat')) {
    // Prisma 7 + pg-connection-string treat sslmode=require/prefer/verify-ca as verify-full
    // unless libpq compatibility is explicitly enabled. Our hosted production URLs often rely
    // on libpq semantics when no CA bundle is configured.
    databaseUrl.searchParams.set('uselibpqcompat', 'true')
  }

  return databaseUrl.toString()
}
