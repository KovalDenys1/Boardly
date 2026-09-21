/**
 * Integration tests for guest user flow (guest helper + client guest fetch)
 */

import { getOrCreateGuestUser } from '@/lib/guest-helpers'
import { fetchWithGuest, getGuestHeaders, getGuestData, isGuestMode } from '@/lib/fetch-with-guest'

const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

jest.mock('@/lib/logger', () => ({
  apiLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

import { prisma } from '@/lib/db'

describe('Guest user flow integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorageMock.clear()
  })

  it('completes local guest bootstrap and backend user creation flow', async () => {
    const guestId = 'guest_integration_test'
    const guestName = 'Integration Guest'
    const guestToken = 'guest.jwt.token'

    localStorageMock.setItem('boardly_guest_id', guestId)
    localStorageMock.setItem('boardly_guest_name', guestName)
    localStorageMock.setItem('boardly_guest_token', guestToken)

    expect(isGuestMode()).toBe(true)
    expect(getGuestData()).toEqual({ guestId, guestName, guestToken })
    expect(getGuestHeaders()).toEqual({ 'X-Guest-Token': guestToken })

    ;(prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.users.create as jest.Mock).mockResolvedValue({
      id: guestId,
      username: guestName,
      email: `guest-${guestId}@boardly.guest`,
      isGuest: true,
      lastActiveAt: new Date(),
    })

    const user = await getOrCreateGuestUser(guestId, guestName)

    expect(user.id).toBe(guestId)
    expect(user.isGuest).toBe(true)
    expect(prisma.users.create).toHaveBeenCalled()
  })

  it('automatically attaches guest token to API requests', async () => {
    localStorageMock.setItem('boardly_guest_id', 'guest_req')
    localStorageMock.setItem('boardly_guest_name', 'Request Guest')
    localStorageMock.setItem('boardly_guest_token', 'request.token')

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as any

    await fetchWithGuest('/api/lobby', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Lobby' }),
    })

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = opts.headers as Headers

    expect(url).toBe('/api/lobby')
    expect(opts.method).toBe('POST')
    expect(headers.get('X-Guest-Token')).toBe('request.token')
  })

  it('updates guest lastActiveAt for existing guest users', async () => {
    const guestId = 'guest_active'
    const guestName = 'Active Guest'

    ;(prisma.users.findFirst as jest.Mock).mockResolvedValue({
      id: guestId,
      username: guestName,
      email: `guest-${guestId}@boardly.guest`,
      isGuest: true,
      // Beyond the 5-minute activity throttle (#683) so the write isn't skipped.
      lastActiveAt: new Date(Date.now() - 10 * 60_000),
    })
    ;(prisma.users.update as jest.Mock).mockResolvedValue({
      id: guestId,
      username: guestName,
      email: `guest-${guestId}@boardly.guest`,
      isGuest: true,
      lastActiveAt: new Date(),
    })

    await getOrCreateGuestUser(guestId, guestName)

    expect(prisma.users.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: guestId },
        data: expect.objectContaining({
          lastActiveAt: expect.any(Date),
        }),
      })
    )
  })

  // The 24-hour cleanup this suite used to exercise was lib/guest-helpers' own
  // copy: no relation filter, no retention policy, and one import away from
  // undoing #1047's ninety-day window for guests who have played. It was deleted
  // in #1051 and the one surviving policy is covered by
  // __tests__/scripts/cleanup-old-guests.test.ts.
  it('does not delete a guest on any path this flow takes', async () => {
    ;(prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.users.create as jest.Mock).mockResolvedValue({
      id: 'guest-6b3c1f22-90ad-4c5e-9c7a-51d0e4f7a8b2',
      username: 'Denys',
      isGuest: true,
      lastActiveAt: new Date(),
    })

    await getOrCreateGuestUser('guest-6b3c1f22-90ad-4c5e-9c7a-51d0e4f7a8b2', 'Denys')

    expect(prisma.users.deleteMany).not.toHaveBeenCalled()
  })
})
