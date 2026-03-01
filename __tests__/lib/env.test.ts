import { validateEnv } from '@/lib/env'

describe('validateEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  function applyBaseEnv(nodeEnv: 'development' | 'production') {
    Object.assign(process.env, {
      NODE_ENV: nodeEnv,
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/boardly',
      NEXTAUTH_SECRET: 'x'.repeat(32),
      SOCKET_SERVER_INTERNAL_SECRET: 'y'.repeat(16),
      NEXT_PUBLIC_SOCKET_URL: 'http://localhost:3001',
      CORS_ORIGIN: 'http://localhost:3000',
    })
  }

  it('allows development without CRON_SECRET', () => {
    applyBaseEnv('development')
    delete process.env.CRON_SECRET

    expect(() => validateEnv()).not.toThrow()
  })

  it('fails in production when CRON_SECRET is missing', () => {
    applyBaseEnv('production')
    delete process.env.CRON_SECRET

    expect(() => validateEnv()).toThrow('CRON_SECRET is required in production')
  })

  it('passes in production when CRON_SECRET is configured', () => {
    applyBaseEnv('production')
    process.env.CRON_SECRET = 'z'.repeat(32)

    expect(() => validateEnv()).not.toThrow()
  })
})
