/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Prisma mocks are intentionally lightweight for route tests.
// #1226: the player card follows the profile's visibility, so the user id every lobby
// hands out is not a way round it. The one exception: someone who shared a lobby with
// the player already saw their picture there, and still sees it on the card.

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { GET } from '@/app/api/users/[userId]/card/route'
import { optionalSessionUser } from '@/lib/session-user'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'

jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    friendships: { findFirst: jest.fn() },
    friendRequests: { findFirst: jest.fn() },
    players: { findFirst: jest.fn() },
  },
}))

jest.mock('@/lib/session-user', () => ({
  optionalSessionUser: jest.fn(),
}))

jest.mock('@/lib/guest-auth', () => ({
  getGuestClaimsFromRequest: jest.fn(() => null),
}))

jest.mock('@/lib/rate-limit', () => ({
  rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
  rateLimitPresets: { userCard: {} },
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSession = optionalSessionUser as jest.Mock
const mockGuestClaims = getGuestClaimsFromRequest as jest.Mock

const TARGET = 'target_user'
const AVATAR = 'https://cdn.example/target.png'

function target(profileVisibility: 'public' | 'friends' | 'private' | null) {
  return {
    id: TARGET,
    username: 'Target',
    image: null,
    avatarUrl: AVATAR,
    publicProfileId: 'TargetPP0001',
    isGuest: false,
    premiumUntil: new Date('2099-01-01T00:00:00Z'),
    bot: null,
    accountPreferences: profileVisibility ? { profileVisibility } : null,
    players: [
      { isWinner: true, game: { gameType: 'yahtzee' } },
      { isWinner: false, game: { gameType: 'yahtzee' } },
    ],
  }
}

function signedIn(id: string | null) {
  mockSession.mockResolvedValue({ session: id ? { user: { id } } : null })
}

async function card() {
  const response = await GET(new NextRequest(`http://localhost:3000/api/users/${TARGET}/card`), {
    params: Promise.resolve({ userId: TARGET }),
  })
  expect(response.status).toBe(200)
  const text = await response.text()
  return { body: JSON.parse(text), text }
}

function expectRestricted(result: { body: Record<string, unknown>; text: string }, picture: boolean) {
  expect(result.body).toMatchObject({ username: 'Target', publicProfileId: 'TargetPP0001', restricted: true })
  expect(result.body.gamesPlayed).toBeUndefined()
  expect(result.body.wins).toBeUndefined()
  expect(result.body.winRate).toBeUndefined()
  expect(result.body.favouriteGame).toBeUndefined()
  if (picture) {
    expect(result.body).toMatchObject({ image: AVATAR, isPremium: true })
  } else {
    expect(result.body).toMatchObject({ image: null, isPremium: false })
    expect(result.text).not.toContain(AVATAR)
  }
}

describe('GET /api/users/[userId]/card profile visibility (#1226)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.friendships.findFirst.mockResolvedValue(null)
    mockPrisma.friendRequests.findFirst.mockResolvedValue(null)
    mockPrisma.players.findFirst.mockResolvedValue(null)
    mockGuestClaims.mockReturnValue(null)
    signedIn(null)
  })

  it('public: the full card for anyone', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('public'))

    const { body } = await card()

    expect(body).toMatchObject({ image: AVATAR, isPremium: true, gamesPlayed: 2, wins: 1, winRate: 50, favouriteGame: 'yahtzee' })
    expect(body.restricted).toBeUndefined()
    expect(mockPrisma.players.findFirst).not.toHaveBeenCalled()
  })

  it('an account with no preferences row is the legacy public profile', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target(null))

    const { body } = await card()

    expect(body).toMatchObject({ image: AVATAR, gamesPlayed: 2 })
  })

  it('friends-only, seen by a friend: the full card', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('friends'))
    mockPrisma.friendships.findFirst.mockResolvedValue({ id: 'friendship_1' })
    signedIn('friend_1')

    const { body } = await card()

    expect(body).toMatchObject({ relation: 'friends', image: AVATAR, gamesPlayed: 2 })
  })

  it('friends-only, seen by a non-friend who never shared a lobby: the username alone', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('friends'))
    signedIn('stranger_1')

    expectRestricted(await card(), false)
    expect(mockPrisma.players.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'stranger_1',
        game: { lobby: { games: { some: { players: { some: { userId: TARGET } } } } } },
      },
      select: { id: true },
    })
  })

  it('private, seen signed out with no guest token: the username alone, and no lobby lookup', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('private'))

    expectRestricted(await card(), false)
    expect(mockPrisma.players.findFirst).not.toHaveBeenCalled()
  })

  it('private, seen by a friend: still the username alone', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('private'))
    mockPrisma.friendships.findFirst.mockResolvedValue({ id: 'friendship_1' })
    signedIn('friend_1')

    expectRestricted(await card(), false)
  })

  it('private, seen by someone who shared a lobby with the player: the picture and badge, no statistics', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('private'))
    mockPrisma.players.findFirst.mockResolvedValue({ id: 'seat_1' })
    signedIn('lobby_mate_1')

    expectRestricted(await card(), true)
  })

  it('a guest lobby-mate is recognised by the guest token', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('private'))
    mockGuestClaims.mockReturnValue({ guestId: 'guest_1', guestName: 'Guest' })
    mockPrisma.players.findFirst.mockImplementation(async ({ where }) =>
      where.userId === 'guest_1' ? { id: 'seat_guest' } : null
    )

    expectRestricted(await card(), true)
  })

  it('private, seen by its owner: the full card', async () => {
    mockPrisma.users.findUnique.mockResolvedValue(target('private'))
    signedIn(TARGET)

    const { body } = await card()

    expect(body).toMatchObject({ relation: 'self', image: AVATAR, gamesPlayed: 2 })
    expect(body.restricted).toBeUndefined()
  })
})
