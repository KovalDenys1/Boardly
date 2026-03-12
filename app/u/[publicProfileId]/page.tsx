import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import PublicProfileView, {
  type PublicProfileAccessState,
  type PublicProfileRelation,
} from '@/components/PublicProfileView'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/next-auth'
import { isValidPublicProfileId } from '@/lib/public-profile'

type PublicProfilePageProps = {
  params: Promise<{ publicProfileId: string }>
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
      createdAt: true,
      publicProfileId: true,
      isGuest: true,
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

  const profileVisibility = profile.accountPreferences?.profileVisibility ?? 'public'
  let accessState: PublicProfileAccessState = 'available'
  if (profileVisibility === 'private' && relation !== 'self') {
    accessState = 'private'
  } else if (
    profileVisibility === 'friends' &&
    relation !== 'self' &&
    relation !== 'friends'
  ) {
    accessState = 'friends_only'
  }

  return (
    <PublicProfileView
      profile={{
        publicProfileId: profile.publicProfileId,
        username: profile.username,
        image: profile.image,
        createdAt: profile.createdAt.toISOString(),
        friendsCount: profile._count.friendshipsInitiated + profile._count.friendshipsReceived,
        gamesPlayed: profile._count.players,
      }}
      initialRelation={relation}
      accessState={accessState}
    />
  )
}
