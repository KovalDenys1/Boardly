import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'
import { getRequestAuthUser } from '@/lib/request-auth'

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/db', () => ({
  prisma: {
    users: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/guest-auth', () => ({
  getGuestClaimsFromRequest: jest.fn(),
}))

jest.mock('@/lib/guest-helpers', () => ({
  getOrCreateGuestUser: jest.fn(),
}))

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockGetGuestClaimsFromRequest = getGuestClaimsFromRequest as jest.MockedFunction<
  typeof getGuestClaimsFromRequest
>
const mockGetOrCreateGuestUser = getOrCreateGuestUser as jest.MockedFunction<typeof getOrCreateGuestUser>

describe('getRequestAuthUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns null when no session and no guest token', async () => {
    mockGetServerSession.mockResolvedValue(null as never)
    mockGetGuestClaimsFromRequest.mockReturnValue(null)

    const result = await getRequestAuthUser(new Request('http://localhost/test'))

    expect(result).toBeNull()
  })

  it('returns null for suspended session user without querying DB', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-1',
        name: 'Suspended User',
        suspended: true,
      },
    } as never)

    const result = await getRequestAuthUser(new Request('http://localhost/test'))

    expect(result).toBeNull()
    expect(prisma.users.findUnique).not.toHaveBeenCalled()
  })

  it('returns null when DB user is suspended', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-2',
        name: 'Active Token User',
        suspended: false,
      },
    } as never)
    ;(prisma.users.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-2',
      username: 'db-user',
      suspended: true,
    })

    const result = await getRequestAuthUser(new Request('http://localhost/test'))

    expect(result).toBeNull()
    expect(prisma.users.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-2' },
      select: { id: true, username: true, suspended: true },
    })
  })

  it('returns authenticated user when session and DB user are active', async () => {
    mockGetServerSession.mockResolvedValue({
      user: {
        id: 'user-3',
        email: 'active@example.com',
        suspended: false,
      },
    } as never)
    ;(prisma.users.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-3',
      username: 'Active Player',
      suspended: false,
    })

    const result = await getRequestAuthUser(new Request('http://localhost/test'))

    expect(result).toEqual({
      id: 'user-3',
      username: 'Active Player',
      isGuest: false,
    })
  })

  it('returns guest user when no session but valid guest token exists', async () => {
    mockGetServerSession.mockResolvedValue(null as never)
    mockGetGuestClaimsFromRequest.mockReturnValue({
      guestId: 'guest-1',
      guestName: 'Guest One',
      expiresAt: Date.now() + 10_000,
    })
    mockGetOrCreateGuestUser.mockResolvedValue({
      id: 'guest-1',
      username: 'Guest One',
    } as never)

    const result = await getRequestAuthUser(new Request('http://localhost/test'))

    expect(result).toEqual({
      id: 'guest-1',
      username: 'Guest One',
      isGuest: true,
    })
    expect(prisma.users.findUnique).not.toHaveBeenCalled()
  })
})
