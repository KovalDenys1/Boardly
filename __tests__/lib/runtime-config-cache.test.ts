/**
 * @jest-environment node
 */
import { unstable_cache } from 'next/cache'

jest.mock('next/cache', () => ({ unstable_cache: jest.fn((fn) => fn) }))
jest.mock('@/lib/db', () => ({ prisma: {} }))
jest.mock('@/lib/logger', () => ({ apiLogger: jest.fn(() => ({ error: jest.fn() })) }))

describe('runtime-config caches', () => {
  it('caches the announcement for an hour under the tag the Control Panel expires', async () => {
    const { ANNOUNCEMENTS_TAG } = await import('@/lib/runtime-config')

    const call = (unstable_cache as jest.Mock).mock.calls.find(([, keyParts]) => keyParts[0] === 'active-announcement')

    expect(call?.[2]).toEqual({ revalidate: 3600, tags: [ANNOUNCEMENTS_TAG] })
    expect(ANNOUNCEMENTS_TAG).toBe('announcements')
  })
})
