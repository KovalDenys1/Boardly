/**
 * @jest-environment node
 */
// #1226: the leaderboard lists every player whatever their profile visibility, and
// sends a player's picture only to a viewer who may see their profile.

import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import { prisma } from '@/lib/db'

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    friendships: { findMany: jest.fn() },
  },
}))

// unstable_cache needs Next's incremental cache, which jest does not have.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}))

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock
const mockFindFriendships = prisma.friendships.findMany as unknown as jest.Mock

const PICTURES = {
  pub: 'https://cdn.example/public.png',
  friends: 'https://cdn.example/friends-only.png',
  priv: 'https://cdn.example/private.png',
  legacy: 'https://cdn.example/legacy.png',
}

function row(userId: string, profileVisibility: string | null, avatarUrl: string) {
  return {
    userId,
    username: `name-${userId}`,
    publicProfileId: `pp-${userId}`,
    avatarUrl,
    image: null,
    profileVisibility,
    premiumUntil: null,
    gamesPlayed: BigInt(12),
    wins: BigInt(6),
    losses: BigInt(6),
    winRate: 50,
  }
}

const QUERY = { period: 'all' as const, page: 0 }

function avatarsById(entries: { userId: string; avatarUrl: string | null }[]) {
  return Object.fromEntries(entries.map((e) => [e.userId, e.avatarUrl]))
}

describe('leaderboard profile visibility (#1226)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQueryRaw.mockResolvedValue([
      row('pub', 'public', PICTURES.pub),
      row('friends', 'friends', PICTURES.friends),
      row('priv', 'private', PICTURES.priv),
      // No AccountPreferences row: an account from before #1131, public as it always was.
      row('legacy', null, PICTURES.legacy),
    ])
    mockFindFriendships.mockResolvedValue([])
  })

  it('lists private and friends-only players with their username and results', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, null)

    expect(entries.map((e) => e.userId)).toEqual(['pub', 'friends', 'priv', 'legacy'])
    const priv = entries.find((e) => e.userId === 'priv')!
    expect(priv).toMatchObject({ username: 'name-priv', publicProfileId: 'pp-priv', gamesPlayed: 12, wins: 6, losses: 6, winRate: 50 })

    // The query no longer drops private profiles, and still drops bots.
    const sql = mockQueryRaw.mock.calls[0][0].strings.join('')
    expect(sql).not.toContain("!= 'private'")
    expect(sql).toContain('b.id IS NULL')
  })

  it('a signed-out visitor gets the picture of public profiles only', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, null)

    expect(avatarsById(entries)).toEqual({
      pub: PICTURES.pub,
      friends: null,
      priv: null,
      legacy: PICTURES.legacy,
    })
    expect(mockFindFriendships).not.toHaveBeenCalled()
  })

  it('a friend gets the friends-only picture; a private one stays hidden', async () => {
    mockFindFriendships.mockResolvedValue([{ user1Id: 'friends', user2Id: 'viewer' }])

    const { entries } = await fetchLeaderboardPage(QUERY, 'viewer')

    expect(avatarsById(entries)).toEqual({
      pub: PICTURES.pub,
      friends: PICTURES.friends,
      priv: null,
      legacy: PICTURES.legacy,
    })
    // One lookup, for the friends-only players on the page only.
    expect(mockFindFriendships).toHaveBeenCalledTimes(1)
    expect(mockFindFriendships.mock.calls[0][0].where.OR).toEqual([
      { user1Id: 'viewer', user2Id: { in: ['friends'] } },
      { user2Id: 'viewer', user1Id: { in: ['friends'] } },
    ])
  })

  it('a signed-in non-friend gets no friends-only or private picture', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, 'stranger')

    expect(avatarsById(entries)).toEqual({
      pub: PICTURES.pub,
      friends: null,
      priv: null,
      legacy: PICTURES.legacy,
    })
  })

  it('the owner of a private profile sees their own picture', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, 'priv')

    expect(avatarsById(entries).priv).toBe(PICTURES.priv)
    expect(avatarsById(entries).friends).toBeNull()
  })

  it('no hidden picture URL, and no visibility field, is anywhere in what a viewer receives', async () => {
    const page = await fetchLeaderboardPage(QUERY, 'stranger')
    const serialized = JSON.stringify(page)

    expect(serialized).not.toContain(PICTURES.friends)
    expect(serialized).not.toContain(PICTURES.priv)
    expect(serialized).not.toContain('profileVisibility')
  })

  it('falls back to the connected-account image for a visible profile, and hides it for a hidden one', async () => {
    mockQueryRaw.mockResolvedValue([
      { ...row('pub', 'public', ''), avatarUrl: null, image: 'https://oauth.example/pub.jpg' },
      { ...row('priv', 'private', ''), avatarUrl: null, image: 'https://oauth.example/priv.jpg' },
    ])

    const page = await fetchLeaderboardPage(QUERY, null)

    expect(avatarsById(page.entries)).toEqual({ pub: 'https://oauth.example/pub.jpg', priv: null })
    expect(JSON.stringify(page)).not.toContain('oauth.example/priv.jpg')
  })
})
