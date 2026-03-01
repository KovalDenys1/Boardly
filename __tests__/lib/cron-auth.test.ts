/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { authorizeCronRequest } from '@/lib/cron-auth'

describe('lib/cron-auth', () => {
  const originalCronSecret = process.env.CRON_SECRET
  const originalNextAuthSecret = process.env.NEXTAUTH_SECRET

  afterEach(() => {
    if (typeof originalCronSecret === 'string') {
      process.env.CRON_SECRET = originalCronSecret
    } else {
      delete process.env.CRON_SECRET
    }

    if (typeof originalNextAuthSecret === 'string') {
      process.env.NEXTAUTH_SECRET = originalNextAuthSecret
    } else {
      delete process.env.NEXTAUTH_SECRET
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

  it('does not allow NEXTAUTH_SECRET as fallback when CRON_SECRET differs', async () => {
    process.env.CRON_SECRET = 'cron-secret'
    process.env.NEXTAUTH_SECRET = 'nextauth-secret'

    const result = authorizeCronRequest(
      new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer nextauth-secret' },
      })
    )

    expect(result).not.toBeNull()
    expect(result?.status).toBe(401)
    await expect(result?.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('returns 503 without CRON_SECRET even when NEXTAUTH_SECRET is present', async () => {
    delete process.env.CRON_SECRET
    process.env.NEXTAUTH_SECRET = 'nextauth-secret'

    const result = authorizeCronRequest(
      new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer nextauth-secret' },
      })
    )

    expect(result).not.toBeNull()
    expect(result?.status).toBe(503)
    await expect(result?.json()).resolves.toEqual({
      error: 'CRON_SECRET is not configured',
    })
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
