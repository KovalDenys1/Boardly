import { normalizeRuntimeDatabaseUrl } from '@/lib/db-connection-string'

describe('normalizeRuntimeDatabaseUrl', () => {
  it('enables libpq compatibility for sslmode=require when no CA bundle is configured', () => {
    const normalized = normalizeRuntimeDatabaseUrl(
      'postgresql://postgres:secret@db.example.com:5432/postgres?sslmode=require'
    )

    const parsed = new URL(normalized)
    expect(parsed.searchParams.get('sslmode')).toBe('require')
    expect(parsed.searchParams.get('uselibpqcompat')).toBe('true')
  })

  it('does not override an explicit uselibpqcompat setting', () => {
    const normalized = normalizeRuntimeDatabaseUrl(
      'postgresql://postgres:secret@db.example.com:5432/postgres?sslmode=require&uselibpqcompat=false'
    )

    const parsed = new URL(normalized)
    expect(parsed.searchParams.get('uselibpqcompat')).toBe('false')
  })

  it('keeps strict verify-full mode when a CA bundle is configured', () => {
    const normalized = normalizeRuntimeDatabaseUrl(
      'postgresql://postgres:secret@db.example.com:5432/postgres?sslmode=require&uselibpqcompat=true',
      { caCertPath: '/etc/ssl/private/postgres-ca.pem' }
    )

    const parsed = new URL(normalized)
    expect(parsed.searchParams.get('sslmode')).toBe('verify-full')
    expect(parsed.searchParams.get('sslrootcert')).toBe('/etc/ssl/private/postgres-ca.pem')
    expect(parsed.searchParams.get('uselibpqcompat')).toBeNull()
  })

  it('leaves URLs without sslmode untouched when no CA bundle is configured', () => {
    const normalized = normalizeRuntimeDatabaseUrl(
      'postgresql://postgres:secret@db.example.com:5432/postgres'
    )

    expect(normalized).toBe('postgresql://postgres:secret@db.example.com:5432/postgres')
  })
})
