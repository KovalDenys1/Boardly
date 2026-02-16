/**
 * Integration tests for guest user flow (guest helper + client guest fetch)
 */

import { getOrCreateGuestUser, cleanupOldGuests } from '@/lib/guest-helpers'
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
      lastActiveAt: new Date(Date.now() - 60_000),
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

  it('cleans up stale guests older than 24 hours', async () => {
    ;(prisma.users.deleteMany as jest.Mock).mockResolvedValue({ count: 7 })

    const deletedCount = await cleanupOldGuests()

    expect(deletedCount).toBe(7)
    expect(prisma.users.deleteMany).toHaveBeenCalledWith({
      where: {
        isGuest: true,
        lastActiveAt: {
          lt: expect.any(Date),
        },
      },
    })
  })
})
