/**
 * @jest-environment node
 */
// #1226: the leaderboard lists every player whatever their profile visibility, with
// their username, picture and results, which are public (Denys, 2026-09-27 20:32). The
// premium badge is profile content: only a viewer who may see the profile gets it. No
// row carries the internal user id.

import { fetchLeaderboardPage } from '@/lib/server/leaderboard'
import LeaderboardPage from '@/app/leaderboard/page'
import { prisma } from '@/lib/db'
import { getOptionalViewerId } from '@/lib/session-user'

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

jest.mock('@/lib/session-user', () => ({
  getOptionalViewerId: jest.fn(),
}))

// The page hands its rows to this client component; its props are what the RSC
// payload carries to the browser, so the test reads them rather than the markup.
jest.mock('@/app/leaderboard/LeaderboardClient', () => ({
  __esModule: true,
  default: function LeaderboardClientMock() {
    return null
  },
}))

const mockQueryRaw = prisma.$queryRaw as unknown as jest.Mock
const mockFindFriendships = prisma.friendships.findMany as unknown as jest.Mock
const mockViewerId = getOptionalViewerId as jest.Mock

const PICTURES = {
  pub: 'https://cdn.example/public.png',
  friends: 'https://cdn.example/friends-only.png',
  priv: 'https://cdn.example/private.png',
  legacy: 'https://cdn.example/legacy.png',
}

// Internal ids unlike anything else in a row, so a leak is unmistakable.
const IDS = {
  pub: 'cuid_pub_0001',
  friends: 'cuid_friends_0002',
  priv: 'cuid_private_0003',
  legacy: 'cuid_legacy_0004',
}

type Key = keyof typeof IDS

function row(key: Key, profileVisibility: string | null) {
  return {
    userId: IDS[key],
    username: key,
    publicProfileId: `pp-${key}`,
    avatarUrl: PICTURES[key],
    image: null,
    profileVisibility,
    // Every fixture player has Premium, so a badge that should be hidden shows up.
    premiumUntil: new Date('2099-01-01T00:00:00Z'),
    gamesPlayed: BigInt(12),
    wins: BigInt(6),
    losses: BigInt(6),
    winRate: 50,
  }
}

const QUERY = { period: 'all' as const, page: 0 }

function byName<T extends keyof import('@/lib/leaderboard').LeaderboardEntry>(
  entries: import('@/lib/leaderboard').LeaderboardEntry[],
  field: T
) {
  return Object.fromEntries(entries.map((e) => [e.username, e[field]]))
}

describe('leaderboard profile visibility (#1226)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockQueryRaw.mockResolvedValue([
      row('pub', 'public'),
      row('friends', 'friends'),
      row('priv', 'private'),
      // No AccountPreferences row: an account from before #1131, public as it always was.
      row('legacy', null),
    ])
    mockFindFriendships.mockResolvedValue([])
    mockViewerId.mockResolvedValue(null)
  })

  it('lists private and friends-only players with their username and results', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, null)

    expect(entries.map((e) => e.username)).toEqual(['pub', 'friends', 'priv', 'legacy'])
    const priv = entries.find((e) => e.username === 'priv')!
    expect(priv).toMatchObject({ rank: 3, publicProfileId: 'pp-priv', gamesPlayed: 12, wins: 6, losses: 6, winRate: 50 })

    // The query no longer drops private profiles, and still drops bots.
    const sql = mockQueryRaw.mock.calls[0][0].strings.join('')
    expect(sql).not.toContain("!= 'private'")
    expect(sql).toContain('b.id IS NULL')
  })

  it('a signed-out visitor gets every picture, and the badge of public profiles only', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, null)

    expect(byName(entries, 'avatarUrl')).toEqual({ pub: PICTURES.pub, friends: PICTURES.friends, priv: PICTURES.priv, legacy: PICTURES.legacy })
    expect(byName(entries, 'isPremium')).toEqual({ pub: true, friends: false, priv: false, legacy: true })
    expect(mockFindFriendships).not.toHaveBeenCalled()
  })

  it("a friend gets the friends-only badge; a private one's badge stays hidden", async () => {
    mockFindFriendships.mockResolvedValue([{ user1Id: IDS.friends, user2Id: 'viewer' }])

    const { entries } = await fetchLeaderboardPage(QUERY, 'viewer')

    expect(byName(entries, 'avatarUrl')).toEqual({ pub: PICTURES.pub, friends: PICTURES.friends, priv: PICTURES.priv, legacy: PICTURES.legacy })
    expect(byName(entries, 'isPremium')).toEqual({ pub: true, friends: true, priv: false, legacy: true })
    // One lookup, for the friends-only players on the page only.
    expect(mockFindFriendships).toHaveBeenCalledTimes(1)
    expect(mockFindFriendships.mock.calls[0][0].where.OR).toEqual([
      { user1Id: 'viewer', user2Id: { in: [IDS.friends] } },
      { user2Id: 'viewer', user1Id: { in: [IDS.friends] } },
    ])
  })

  it('a signed-in non-friend gets every picture, and no friends-only or private badge', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, 'stranger')

    expect(byName(entries, 'avatarUrl')).toEqual({ pub: PICTURES.pub, friends: PICTURES.friends, priv: PICTURES.priv, legacy: PICTURES.legacy })
    expect(byName(entries, 'isPremium')).toEqual({ pub: true, friends: false, priv: false, legacy: true })
  })

  it('the owner of a private profile sees their own badge', async () => {
    const { entries } = await fetchLeaderboardPage(QUERY, IDS.priv)

    expect(byName(entries, 'isPremium').priv).toBe(true)
    expect(byName(entries, 'isPremium').friends).toBe(false)
  })

  it('no user id and no visibility field is anywhere in what a viewer receives', async () => {
    const page = await fetchLeaderboardPage(QUERY, 'stranger')
    const serialized = JSON.stringify(page)

    expect(serialized).not.toContain('profileVisibility')
    expect(serialized).not.toContain('userId')
    for (const id of Object.values(IDS)) expect(serialized).not.toContain(id)
  })

  it('the server-rendered page hands the client no user id either, and no hidden badge', async () => {
    mockViewerId.mockResolvedValue('stranger')

    const element = await LeaderboardPage({ searchParams: Promise.resolve({}) })
    const payload = JSON.stringify(element.props)

    expect(element.props.initial.entries).toHaveLength(4)
    for (const id of Object.values(IDS)) expect(payload).not.toContain(id)
    expect(payload).not.toContain('userId')
    expect(byName(element.props.initial.entries, 'isPremium')).toEqual({ pub: true, friends: false, priv: false, legacy: true })
  })

  it('falls back to the connected-account image, whatever the visibility', async () => {
    mockQueryRaw.mockResolvedValue([
      { ...row('pub', 'public'), avatarUrl: null, image: 'https://oauth.example/pub.jpg' },
      { ...row('priv', 'private'), avatarUrl: null, image: 'https://oauth.example/priv.jpg' },
    ])

    const page = await fetchLeaderboardPage(QUERY, null)

    expect(byName(page.entries, 'avatarUrl')).toEqual({ pub: 'https://oauth.example/pub.jpg', priv: 'https://oauth.example/priv.jpg' })
  })
})
