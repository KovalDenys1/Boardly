/**
 * @jest-environment node
 */
// #1226: a profile the viewer may not see (private, or friends-only for a non-friend)
// sends the page its username and nothing else; the owner always sees it in full.

import { getServerSession } from 'next-auth'
import PublicProfilePage from '@/app/u/[publicProfileId]/page'
import { prisma } from '@/lib/db'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/next-auth', () => ({ authOptions: {} }))
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
jest.mock('@/lib/db', () => ({
  prisma: {
    users: { findUnique: jest.fn() },
    friendships: { findFirst: jest.fn() },
    friendRequests: { findFirst: jest.fn() },
    players: { count: jest.fn() },
    userAchievements: { findMany: jest.fn() },
  },
}))
// The page is a server component rendering this client one; the test reads the props
// it is handed, which are exactly what the RSC payload carries to the browser.
jest.mock('@/components/PublicProfileView', () => ({
  __esModule: true,
  default: function PublicProfileViewMock() {
    return null
  },
}))

const mockSession = getServerSession as jest.Mock
const mockFindUser = prisma.users.findUnique as unknown as jest.Mock
const mockFindFriendship = prisma.friendships.findFirst as unknown as jest.Mock
const mockFindRequest = prisma.friendRequests.findFirst as unknown as jest.Mock
const mockCountPlayers = prisma.players.count as unknown as jest.Mock
const mockFindAchievements = prisma.userAchievements.findMany as unknown as jest.Mock

const PUBLIC_PROFILE_ID = 'AbC123xYz890'
const AVATAR = 'https://cdn.example/owner-avatar.png'
const OAUTH_IMAGE = 'https://oauth.example/owner.jpg'
const BIO = 'a bio only friends should read'

function owner(profileVisibility: 'public' | 'friends' | 'private' | null) {
  return {
    id: 'owner-1',
    username: 'Owner',
    image: OAUTH_IMAGE,
    avatarUrl: AVATAR,
    bio: BIO,
    premiumCardStyle: 'gold',
    accentColor: '#ff0000',
    featuredGame: 'yahtzee',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    publicProfileId: PUBLIC_PROFILE_ID,
    isGuest: false,
    premiumUntil: new Date('2099-01-01T00:00:00Z'),
    bot: null,
    accountPreferences: profileVisibility ? { profileVisibility } : null,
    _count: { friendshipsInitiated: 2, friendshipsReceived: 1, players: 40 },
  }
}

async function render(viewer: { id: string } | null) {
  mockSession.mockResolvedValue(viewer ? { user: { id: viewer.id, emailVerified: new Date() } } : null)
  const element = await PublicProfilePage({ params: Promise.resolve({ publicProfileId: PUBLIC_PROFILE_ID }) })
  return element.props as {
    profile: Record<string, unknown>
    accessState: string
    initialRelation: string
    ownerVisibility?: string
  }
}

function expectOnlyUsername(props: Awaited<ReturnType<typeof render>>) {
  expect(props.profile).toEqual({ publicProfileId: PUBLIC_PROFILE_ID, username: 'Owner' })
  const serialized = JSON.stringify(props)
  for (const leaked of [AVATAR, OAUTH_IMAGE, BIO, 'gold', 'yahtzee', '2026-01-01']) {
    expect(serialized).not.toContain(leaked)
  }
  // Statistics and badges are not even read.
  expect(mockCountPlayers).not.toHaveBeenCalled()
  expect(mockFindAchievements).not.toHaveBeenCalled()
}

describe('/u/[publicProfileId] visibility (#1226)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFindFriendship.mockResolvedValue(null)
    mockFindRequest.mockResolvedValue(null)
    mockCountPlayers.mockResolvedValue(30)
    mockFindAchievements.mockResolvedValue([
      { achievementKey: 'first_win', unlockedAt: new Date('2026-02-01T00:00:00Z') },
    ])
  })

  it('public: everyone gets the full profile', async () => {
    mockFindUser.mockResolvedValue(owner('public'))

    const props = await render(null)

    expect(props.accessState).toBe('available')
    expect(props.profile).toMatchObject({ avatarUrl: AVATAR, bio: BIO, completedGamesCount: 30 })
    expect(props.ownerVisibility).toBeUndefined()
  })

  it('an account with no preferences row is the legacy public profile', async () => {
    mockFindUser.mockResolvedValue(owner(null))

    const props = await render(null)

    expect(props.accessState).toBe('available')
    expect(props.profile).toMatchObject({ avatarUrl: AVATAR })
  })

  it('friends-only, viewed by a friend: the full profile', async () => {
    mockFindUser.mockResolvedValue(owner('friends'))
    mockFindFriendship.mockResolvedValue({ id: 'friendship-1' })

    const props = await render({ id: 'friend-1' })

    expect(props.accessState).toBe('available')
    expect(props.initialRelation).toBe('friends')
    expect(props.profile).toMatchObject({ avatarUrl: AVATAR, bio: BIO })
  })

  it('friends-only, viewed by a signed-in non-friend: the username alone, and the friend request', async () => {
    mockFindUser.mockResolvedValue(owner('friends'))

    const props = await render({ id: 'stranger-1' })

    expect(props.accessState).toBe('friends_only')
    expect(props.initialRelation).toBe('can_send')
    expectOnlyUsername(props)
  })

  it('friends-only, viewed signed out: the username alone', async () => {
    mockFindUser.mockResolvedValue(owner('friends'))

    const props = await render(null)

    expect(props.accessState).toBe('friends_only')
    expectOnlyUsername(props)
  })

  it('private, viewed by a friend: the username alone', async () => {
    mockFindUser.mockResolvedValue(owner('private'))
    mockFindFriendship.mockResolvedValue({ id: 'friendship-1' })

    const props = await render({ id: 'friend-1' })

    expect(props.accessState).toBe('private')
    expectOnlyUsername(props)
  })

  it('private, viewed signed out: the username alone', async () => {
    mockFindUser.mockResolvedValue(owner('private'))

    const props = await render(null)

    expect(props.accessState).toBe('private')
    expectOnlyUsername(props)
  })

  it('private, viewed by its owner: the full profile, and the setting to show the privacy note', async () => {
    mockFindUser.mockResolvedValue(owner('private'))

    const props = await render({ id: 'owner-1' })

    expect(props.accessState).toBe('available')
    expect(props.initialRelation).toBe('self')
    expect(props.ownerVisibility).toBe('private')
    expect(props.profile).toMatchObject({ avatarUrl: AVATAR, bio: BIO })
  })
})
