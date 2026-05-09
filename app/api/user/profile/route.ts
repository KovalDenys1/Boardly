import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { nanoid } from 'nanoid'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { apiLogger } from '@/lib/logger'
import { isValidProfileEmail, normalizeProfileEmail } from '@/lib/profile-email'
import { ensureUserHasPublicProfileId } from '@/lib/public-profile.server'
import {
  AuthenticationError,
  ConflictError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'

const limiter = rateLimit(rateLimitPresets.api)

const log = apiLogger('/api/user/profile')
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

type SelectedProfileUser = {
  id: string
  username: string | null
  email: string | null
  pendingEmail: string | null
  image: string | null
  avatarUrl: string | null
  emailVerified: Date | null
  createdAt: Date
  publicProfileId: string | null
  _count: {
    friendshipsInitiated: number
    friendshipsReceived: number
    players: number
    accounts: number
  }
}

type ProfileAchievementStats = {
  completedGamesCount: number
  winsCount: number
}

function buildProfilePayload(
  user: SelectedProfileUser,
  achievementStats: ProfileAchievementStats = {
    completedGamesCount: 0,
    winsCount: 0,
  }
) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    pendingEmail: user.pendingEmail,
    image: user.image,
    avatarUrl: user.avatarUrl,
    emailVerified: user.emailVerified?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    publicProfileId: user.publicProfileId,
    friendsCount: user._count.friendshipsInitiated + user._count.friendshipsReceived,
    gamesPlayed: achievementStats.completedGamesCount,
    linkedAccountsCount: user._count.accounts,
    achievementStats,
  }
}

async function getProfileAchievementStats(userId: string): Promise<ProfileAchievementStats> {
  const [completedGamesCount, winsCount] = await Promise.all([
    prisma.players.count({
      where: {
        userId,
        game: {
          status: 'finished',
        },
      },
    }),
    prisma.players.count({
      where: {
        userId,
        isWinner: true,
        game: {
          status: 'finished',
        },
      },
    }),
  ])

  return {
    completedGamesCount,
    winsCount,
  }
}

async function getCurrentProfileUser(userId: string) {
  return prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      email: true,
      pendingEmail: true,
      image: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
      publicProfileId: true,
      _count: {
        select: {
          friendshipsInitiated: true,
          friendshipsReceived: true,
          players: true,
          accounts: true,
        },
      },
    },
  })
}

async function getProfileHandler() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  const user = await getCurrentProfileUser(session.user.id)

  if (!user) {
    throw new AuthenticationError('User not found')
  }

  const [publicProfileId, achievementStats] = await Promise.all([
    user.publicProfileId ?? ensureUserHasPublicProfileId(session.user.id),
    getProfileAchievementStats(session.user.id),
  ])

  return NextResponse.json({
    user: buildProfilePayload(
      {
        ...user,
        publicProfileId,
      },
      achievementStats
    ),
  })
}

async function patchProfileHandler(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  const body = (await req.json()) as {
    username?: unknown
    email?: unknown
  }

  const nextUsername = typeof body.username === 'string' ? body.username.trim() : undefined
  const nextEmail = typeof body.email === 'string' ? normalizeProfileEmail(body.email) : undefined

  if (nextUsername === undefined && nextEmail === undefined) {
    throw new ValidationError('Nothing to update')
  }

  const currentUser = await getCurrentProfileUser(session.user.id)

  if (!currentUser) {
    throw new AuthenticationError('User not found')
  }

  const updateData: {
    username?: string | null
    pendingEmail?: string | null
  } = {}

  if (nextUsername !== undefined) {
    if (nextUsername.length < 3 || nextUsername.length > 20) {
      throw new ValidationError('Username must be between 3 and 20 characters')
    }

    if (!/^[a-zA-Z0-9_]+$/.test(nextUsername)) {
      throw new ValidationError('Username can only contain letters, numbers, and underscores')
    }

    if (nextUsername !== (currentUser.username ?? '')) {
      const existingUsername = await prisma.users.findFirst({
        where: {
          username: {
            equals: nextUsername,
            mode: 'insensitive',
          },
          NOT: {
            id: session.user.id,
          },
        },
        select: { id: true },
      })

      if (existingUsername) {
        throw new ConflictError('Username is already taken')
      }

      updateData.username = nextUsername
    }
  }

  let verificationEmailTarget: string | null = null
  if (nextEmail !== undefined) {
    if (!isValidProfileEmail(nextEmail)) {
      throw new ValidationError('Invalid email address')
    }

    const currentEmail = currentUser.email ? normalizeProfileEmail(currentUser.email) : null
    const pendingEmail = currentUser.pendingEmail ? normalizeProfileEmail(currentUser.pendingEmail) : null

    if (nextEmail !== currentEmail && nextEmail !== pendingEmail) {
      const existingEmail = await prisma.users.findFirst({
        where: {
          NOT: { id: session.user.id },
          OR: [
            {
              email: {
                equals: nextEmail,
                mode: 'insensitive',
              },
            },
            {
              pendingEmail: {
                equals: nextEmail,
                mode: 'insensitive',
              },
            },
          ],
        },
        select: { id: true },
      })

      if (existingEmail) {
        throw new ConflictError('Email is already in use')
      }

      updateData.pendingEmail = nextEmail
      verificationEmailTarget = nextEmail
    }
  }

  if (Object.keys(updateData).length === 0) {
    const [publicProfileId, achievementStats] = await Promise.all([
      currentUser.publicProfileId ?? ensureUserHasPublicProfileId(session.user.id),
      getProfileAchievementStats(session.user.id),
    ])

    return NextResponse.json({
      message: 'No changes applied',
      user: buildProfilePayload(
        {
          ...currentUser,
          publicProfileId,
        },
        achievementStats
      ),
    })
  }

  const updateResult = await prisma.$transaction(async (tx) => {
    if (verificationEmailTarget) {
      await tx.emailVerificationTokens.deleteMany({
        where: { userId: session.user.id },
      })
    }

    const user = await tx.users.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        pendingEmail: true,
        image: true,
        avatarUrl: true,
        emailVerified: true,
        createdAt: true,
        publicProfileId: true,
        _count: {
          select: {
            friendshipsInitiated: true,
            friendshipsReceived: true,
            players: true,
            accounts: true,
          },
        },
      },
    })

    let verificationToken: string | null = null
    if (verificationEmailTarget) {
      verificationToken = nanoid(32)
      await tx.emailVerificationTokens.create({
        data: {
          userId: session.user.id,
          token: verificationToken,
          expires: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
        },
      })
    }

    return { user, verificationToken }
  })

  if (updateResult.verificationToken && updateResult.user.pendingEmail) {
    await sendVerificationEmail(
      updateResult.user.pendingEmail,
      updateResult.verificationToken,
      updateResult.user.username || currentUser.username || 'User'
    )
  }

  log.info('Profile updated successfully', {
    userId: session.user.id,
    updatedUsername: Boolean(updateData.username),
    emailChangePending: Boolean(updateResult.verificationToken),
  })

  const [publicProfileId, achievementStats] = await Promise.all([
    updateResult.user.publicProfileId ?? ensureUserHasPublicProfileId(session.user.id),
    getProfileAchievementStats(session.user.id),
  ])

  return NextResponse.json({
    message: updateResult.verificationToken
      ? 'Profile updated. Please verify your new email address.'
      : 'Profile updated successfully',
    user: buildProfilePayload(
      {
        ...updateResult.user,
        publicProfileId,
      },
      achievementStats
    ),
    emailChangePending: Boolean(updateResult.verificationToken),
  })
}

export const GET = withErrorHandler(async (req: NextRequest) => {
  const rl = await limiter(req)
  if (rl) return rl
  return getProfileHandler()
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const rl = await limiter(req)
  if (rl) return rl
  return patchProfileHandler(req)
})
