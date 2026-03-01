/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { authorizeCronRequest } from '@/lib/cron-auth'

describe('lib/cron-auth', () => {
  const originalCronSecret = process.env.CRON_SECRET

  afterEach(() => {
    if (typeof originalCronSecret === 'string') {
      process.env.CRON_SECRET = originalCronSecret
    } else {
      delete process.env.CRON_SECRET
    }
  })

  it('returns 503 when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET

    const result = authorizeCronRequest(
      new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer whatever' },
      })
    )

    expect(result).not.toBeNull()
    expect(result?.status).toBe(503)
    await expect(result?.json()).resolves.toEqual({
      error: 'CRON_SECRET is not configured',
    })
  })

  it('returns 401 when authorization header is missing', async () => {
    process.env.CRON_SECRET = 'cron-secret'

    const result = authorizeCronRequest(new Request('http://localhost/api/cron/test'))

    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
    await expect(result?.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when authorization header does not match', async () => {
    process.env.CRON_SECRET = 'cron-secret'

    const result = authorizeCronRequest(
      new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer wrong-secret' },
      })
    )

    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
    await expect(result?.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns null when authorization header is valid', () => {
    process.env.CRON_SECRET = 'cron-secret'

    const result = authorizeCronRequest(
      new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer cron-secret' },
      })
    )

    expect(result).toBeNull()
  })
})
