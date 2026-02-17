import { canAccessProductAnalytics } from '@/lib/analytics-access'

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_ALLOWED_IDS = process.env.ANALYTICS_ALLOWED_USER_IDS
const ORIGINAL_ALLOWED_EMAILS = process.env.ANALYTICS_ALLOWED_EMAILS

function setNodeEnv(value: string | undefined) {
  ;(process.env as unknown as Record<string, string | undefined>).NODE_ENV = value
}

function resetEnv() {
  setNodeEnv(ORIGINAL_NODE_ENV)
  process.env.ANALYTICS_ALLOWED_USER_IDS = ORIGINAL_ALLOWED_IDS
  process.env.ANALYTICS_ALLOWED_EMAILS = ORIGINAL_ALLOWED_EMAILS
}

describe('canAccessProductAnalytics', () => {
  afterEach(() => {
    resetEnv()
  })

  afterAll(() => {
    resetEnv()
  })

  it('allows access in development when allowlist is not configured', () => {
    setNodeEnv('development')
    delete process.env.ANALYTICS_ALLOWED_USER_IDS
    delete process.env.ANALYTICS_ALLOWED_EMAILS

    expect(canAccessProductAnalytics({ id: 'user-1', email: 'user@example.com' })).toBe(true)
  })

  it('denies access in production when allowlist is not configured', () => {
    setNodeEnv('production')
    delete process.env.ANALYTICS_ALLOWED_USER_IDS
    delete process.env.ANALYTICS_ALLOWED_EMAILS

    expect(canAccessProductAnalytics({ id: 'user-1', email: 'user@example.com' })).toBe(false)
  })

  it('allows access when user id is in allowlist', () => {
    setNodeEnv('production')
    process.env.ANALYTICS_ALLOWED_USER_IDS = 'user-1,user-2'
    delete process.env.ANALYTICS_ALLOWED_EMAILS

    expect(canAccessProductAnalytics({ id: 'user-2', email: 'other@example.com' })).toBe(true)
  })

  it('allows access when email is in allowlist (case-insensitive)', () => {
    setNodeEnv('production')
    delete process.env.ANALYTICS_ALLOWED_USER_IDS
    process.env.ANALYTICS_ALLOWED_EMAILS = 'Admin@Example.com,owner@example.com'

    expect(canAccessProductAnalytics({ id: 'user-9', email: 'admin@example.com' })).toBe(true)
  })

  it('denies access when user is not in configured allowlist', () => {
    setNodeEnv('production')
    process.env.ANALYTICS_ALLOWED_USER_IDS = 'user-1'
    process.env.ANALYTICS_ALLOWED_EMAILS = 'owner@example.com'

    expect(canAccessProductAnalytics({ id: 'user-9', email: 'viewer@example.com' })).toBe(false)
  })
})
