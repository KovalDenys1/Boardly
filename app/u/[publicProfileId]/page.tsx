import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PublicProfileView, {
  type PublicProfileAccessState,
  type PublicProfileRelation,
} from '@/components/PublicProfileView'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/next-auth'
import {
  canViewProfile,
  effectiveProfileVisibility,
  isValidPublicProfileId,
} from '@/lib/public-profile'

type PublicProfilePageProps = {
  params: Promise<{ publicProfileId: string }>
}

// An empty Metadata inherits the root layout's `index: true`, so an invalid id,
// a guest, a bot or a private profile would each be offered to Google as an
// indexable page with no title. Nothing under /u is in the sitemap and nobody
// searches usernames; the only correct answer on those branches is noindex.
const HIDDEN: Metadata = { robots: { index: false, follow: false } }

export async function generateMetadata({ params }: PublicProfilePageProps): Promise<Metadata> {
  const { publicProfileId } = await params
  if (!isValidPublicProfileId(publicProfileId)) {
    return HIDDEN
  }

  const profile = await prisma.users.findUnique({
    where: { publicProfileId },
    select: {
      username: true,
      bio: true,
      isGuest: true,
      bot: { select: { id: true } },
      accountPreferences: { select: { profileVisibility: true } },
    },
  })

  if (!profile || profile.isGuest || profile.bot) {
    return HIDDEN
  }

  const isPublic = effectiveProfileVisibility(profile.accountPreferences?.profileVisibility) === 'public'
  if (!isPublic) {
    return { title: `${profile.username}'s Profile`, ...HIDDEN }
  }

  return {
    title: `${profile.username}'s Profile`,
    description: profile.bio || `View ${profile.username}'s game stats and achievements on Boardly.`,
    alternates: {
      canonical: `https://boardly.online/u/${publicProfileId}`,
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { publicProfileId } = await params

  if (!isValidPublicProfileId(publicProfileId)) {
    notFound()
  }

  const profile = await prisma.users.findUnique({
    where: { publicProfileId },
    select: {
      id: true,
      username: true,
      image: true,
      avatarUrl: true,
      bio: true,
      premiumCardStyle: true,
      accentColor: true,
      featuredGame: true,
      createdAt: true,
      publicProfileId: true,
      isGuest: true,
      premiumUntil: true,
      bot: {
        select: {
          id: true,
        },
      },
      accountPreferences: {
        select: {
          profileVisibility: true,
        },
      },
      _count: {
        select: {
          friendshipsInitiated: true,
          friendshipsReceived: true,
          players: true,
        },
      },
    },
  })

  if (!profile || profile.isGuest || profile.bot || !profile.publicProfileId) {
    notFound()
  }

  const session = await getServerSession(authOptions)
  let relation: PublicProfileRelation = 'login_required'

  if (session?.user?.id) {
    if (session.user.id === profile.id) {
      relation = 'self'
    } else {
      const [existingFriendship, existingRequest] = await Promise.all([
        prisma.friendships.findFirst({
          where: {
            OR: [
              { user1Id: session.user.id, user2Id: profile.id },
              { user1Id: profile.id, user2Id: session.user.id },
            ],
          },
          select: { id: true },
        }),
        prisma.friendRequests.findFirst({
          where: {
            OR: [
              { senderId: session.user.id, receiverId: profile.id, status: 'pending' },
              { senderId: profile.id, receiverId: session.user.id, status: 'pending' },
            ],
          },
          select: {
            id: true,
            senderId: true,
          },
        }),
      ])

      if (existingFriendship) {
        relation = 'friends'
      } else if (existingRequest) {
        relation = existingRequest.senderId === session.user.id ? 'request_sent' : 'request_received'
      } else if (!session.user.emailVerified) {
        relation = 'verification_required'
      } else {
        relation = 'can_send'
      }
    }
  }

  const profileVisibility = effectiveProfileVisibility(profile.accountPreferences?.profileVisibility)
  const canView = canViewProfile(
    profileVisibility,
    relation === 'self' ? 'self' : relation === 'friends' ? 'friend' : 'other'
  )

  // A viewer who may not see the profile gets its username and picture, which are public
  // everywhere, and nothing else (#1226). The rest is left out of the props, not just out
  // of the markup: the RSC payload carries every prop to the browser whatever the
  // component draws. Statistics and badges are not even queried.
  if (!canView) {
    const accessState: PublicProfileAccessState =
      profileVisibility === 'private' ? 'private' : 'friends_only'
    return (
      <PublicProfileView
        profile={{
          publicProfileId: profile.publicProfileId,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
          image: profile.image,
        }}
        initialRelation={relation}
        accessState={accessState}
      />
    )
  }

  const [completedGamesCount, unlockedAchievementRows] = await Promise.all([
    prisma.players.count({
      where: {
        userId: profile.id,
        game: {
          status: 'finished',
        },
      },
    }),
    prisma.userAchievements.findMany({
      where: { userId: profile.id },
      select: { achievementKey: true, unlockedAt: true },
    }),
  ])

  return (
    <PublicProfileView
      profile={{
        publicProfileId: profile.publicProfileId,
        username: profile.username,
        image: profile.image,
        avatarUrl: profile.avatarUrl,
        bio: profile.bio,
        premiumCardStyle: profile.premiumCardStyle,
        accentColor: profile.accentColor,
        featuredGame: profile.featuredGame,
        createdAt: profile.createdAt.toISOString(),
        friendsCount: profile._count.friendshipsInitiated + profile._count.friendshipsReceived,
        gamesPlayed: profile._count.players,
        completedGamesCount,
        isPremium: profile.premiumUntil ? profile.premiumUntil > new Date() : false,
        unlockedAchievements: unlockedAchievementRows.map((row) => ({
          key: row.achievementKey,
          unlockedAt: row.unlockedAt.toISOString(),
        })),
      }}
      initialRelation={relation}
      accessState="available"
      ownerVisibility={relation === 'self' ? profileVisibility : undefined}
    />
  )
}
