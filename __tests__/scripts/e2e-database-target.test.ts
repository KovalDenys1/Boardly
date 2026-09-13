import {
  DEV_DB_REF,
  PRODUCTION_DB_REF,
  describeTargetMismatch,
  expectedRefForTarget,
  refFromDatabaseUrl,
  targetFromBaseUrl,
} from '@/e2e/support/database-target'

const POOLED_DEV = `postgres://postgres.${DEV_DB_REF}:pw@aws-0-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
const POOLED_PROD = `postgres://postgres.${PRODUCTION_DB_REF}:pw@aws-1-eu-central-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
const DIRECT_PROD = `postgres://postgres:pw@db.${PRODUCTION_DB_REF}.supabase.co:5432/postgres`

describe('e2e database target guard (#896)', () => {
  it('reads the project ref off both connection-string shapes', () => {
    expect(refFromDatabaseUrl(POOLED_DEV)).toBe(DEV_DB_REF)
    expect(refFromDatabaseUrl(POOLED_PROD)).toBe(PRODUCTION_DB_REF)
    expect(refFromDatabaseUrl(DIRECT_PROD)).toBe(PRODUCTION_DB_REF)
    expect(refFromDatabaseUrl(undefined)).toBeNull()
    expect(refFromDatabaseUrl('postgres://postgres:pw@localhost:5432/postgres')).toBeNull()
  })

  it('classifies what the suite is pointed at', () => {
    expect(targetFromBaseUrl(undefined)).toBe('local')
    expect(targetFromBaseUrl('http://localhost:3100')).toBe('local')
    expect(targetFromBaseUrl('https://boardly.online')).toBe('production')
    expect(targetFromBaseUrl('https://www.boardly.online')).toBe('production')
    // A Vercel preview points at boardly-dev, like local development
    expect(targetFromBaseUrl('https://boardly-git-develop-kovaldenys1s-projects.vercel.app')).toBe('preview')
    expect(expectedRefForTarget('preview')).toBe(DEV_DB_REF)
    expect(expectedRefForTarget('production')).toBe(PRODUCTION_DB_REF)
  })

  it('passes the pairs that agree', () => {
    expect(describeTargetMismatch({ baseUrl: undefined, databaseUrl: POOLED_DEV })).toBeNull()
    expect(describeTargetMismatch({ baseUrl: 'http://localhost:3100', databaseUrl: POOLED_DEV })).toBeNull()
    expect(describeTargetMismatch({ baseUrl: 'https://boardly.online', databaseUrl: POOLED_PROD })).toBeNull()
  })

  it('refuses the pair that made #896: production browser, dev database', () => {
    const reason = describeTargetMismatch({ baseUrl: 'https://boardly.online', databaseUrl: POOLED_DEV })
    expect(reason).toContain('#896')
    expect(reason).toContain('boardly-dev')
    expect(reason).toContain(PRODUCTION_DB_REF)
    expect(reason).toContain('E2E_DB_ENV_FILE')
  })

  it('refuses the other direction too: local browser, production database', () => {
    // This is the shape the suite had before 2026-09-09, and it is why #867
    // had to delete 383 participation rows and 225 guests out of production.
    const reason = describeTargetMismatch({ baseUrl: 'http://localhost:3100', databaseUrl: POOLED_PROD })
    expect(reason).toContain('production')
    expect(reason).toContain(DEV_DB_REF)
  })

  it('refuses a DATABASE_URL that names no project at all', () => {
    const reason = describeTargetMismatch({ baseUrl: 'https://boardly.online', databaseUrl: undefined })
    expect(reason).toContain('nowhere to clean up')
  })
})
