import { NextRequest, NextResponse } from 'next/server'
import { nanoid } from 'nanoid'
import { prisma } from '@/lib/db'
import { comparePassword } from '@/lib/auth'
import { sendEmailChangeNoticeEmail, sendVerificationEmail } from '@/lib/email'
import { apiLogger } from '@/lib/logger'
import { isValidProfileEmail, normalizeProfileEmail } from '@/lib/profile-email'
import { ensureUserHasPublicProfileId } from '@/lib/public-profile.server'
import {
  prismaErrorCode,
  uniqueConstraintFields,
  UsernameUnavailableError,
  withGuestUsernameReleased,
} from '@/lib/guest-helpers'
import { insensitiveEquals, sameName } from '@/lib/username-match'
import {
  AppError,
  AuthenticationError,
  ConflictError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { getSessionUserOrThrow } from '@/lib/session-user'

const limiter = rateLimit(rateLimitPresets.api)
// The current-password check below is a password oracle for whoever holds the
// session, so it gets the sign-in limiter, not the general API one (#1136).
const emailChangeLimiter = rateLimit({
  ...rateLimitPresets.auth,
  keyScope: 'profile-email-change',
})

// An account with no password (OAuth only) proves itself by a recent sign-in
// instead: the session must have signed in within this window (#1136).
const EMAIL_CHANGE_RECENT_SIGN_IN_MS = 10 * 60 * 1000

const log = apiLogger('/api/user/profile')
const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

type SelectedProfileUser = {
  id: string
  username: string | null
  email: string | null
  pendingEmail: string | null
  passwordHash: string | null
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
  unlockedAchievements: { key: string; unlockedAt: string }[]
}

function buildProfilePayload(
  user: SelectedProfileUser,
  achievementStats: ProfileAchievementStats = {
    completedGamesCount: 0,
    winsCount: 0,
    unlockedAchievements: [],
  }
) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    pendingEmail: user.pendingEmail,
    // Whether an email change asks for the current password or for a recent
    // sign-in (#1136). The hash itself never leaves this file.
    hasPassword: Boolean(user.passwordHash),
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
  const [completedGamesCount, winsCount, unlockedAchievementRows] = await Promise.all([
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
    prisma.userAchievements.findMany({
      where: { userId },
      select: { achievementKey: true, unlockedAt: true },
    }),
  ])

  return {
    completedGamesCount,
    winsCount,
    unlockedAchievements: unlockedAchievementRows.map((row) => ({
      key: row.achievementKey,
      unlockedAt: row.unlockedAt.toISOString(),
    })),
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
      passwordHash: true,
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

/**
 * An email change is the first step of an account takeover: the new address
 * receives the password resets from then on. So the caller proves they are the
 * owner, not just the holder of a session cookie (#1136): the current password
 * for an account that has one, a sign-in within the last ten minutes for an
 * account that signs in only through Google, GitHub or Discord.
 */
async function refuseEmailChange(
  req: NextRequest,
  passwordHash: string | null,
  authenticatedAt: number | null | undefined,
  currentPassword: unknown
): Promise<NextResponse | null> {
  if (passwordHash) {
    const rl = await emailChangeLimiter(req)
    if (rl) return rl

    if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
      throw new AppError('Current password is required', 403, 'CURRENT_PASSWORD_REQUIRED')
    }
    if (!(await comparePassword(currentPassword, passwordHash))) {
      throw new AppError('Current password is incorrect', 403, 'CURRENT_PASSWORD_INCORRECT')
    }
    return null
  }

  const signedInAt = typeof authenticatedAt === 'number' ? authenticatedAt : 0
  if (Date.now() - signedInAt > EMAIL_CHANGE_RECENT_SIGN_IN_MS) {
    throw new AppError(
      'Sign in again to change your email address',
      403,
      'RECENT_SIGN_IN_REQUIRED'
    )
  }
  return null
}

async function getProfileHandler(req: NextRequest) {
  const { session } = await getSessionUserOrThrow(req)

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
  const { session } = await getSessionUserOrThrow(req)

  const body = (await req.json()) as {
    username?: unknown
    email?: unknown
    currentPassword?: unknown
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

  // The guest whose display name is in the way of this request, if any. Only
  // noted here - the rename itself waits until every check has passed and the
  // write is the next thing to run, so a request rejected for its email can no
  // longer rename an uninvolved visitor on its way out (#1055).
  let guestHoldingUsername: { id: string; username: string | null } | null = null

  if (nextUsername !== undefined) {
    if (nextUsername.length < 3 || nextUsername.length > 20) {
      throw new ValidationError('Username must be between 3 and 20 characters')
    }

    if (!/^[a-zA-Z0-9_]+$/.test(nextUsername)) {
      throw new ValidationError('Username can only contain letters, numbers, and underscores')
    }

    if (nextUsername !== (currentUser.username ?? '')) {
      // `findMany`, not `findFirst`. `Users_username_key` is a plain btree on
      // `username` with no lower() (checked against the live database), so the
      // constraint is case-sensitive and "Denys" and "denys" are two legal rows -
      // and getOrCreateGuestUser looks a new guest's name up with an exact match,
      // so a guest really can take the lower-case twin of an account's name. A
      // case-insensitive `findFirst` over that pair returns one of them with no
      // orderBy: when it returned the guest, this route renamed an uninvolved
      // guest and then handed the caller a name a real account holds, because the
      // write itself does not collide. Reading every match is the same fix
      // registration got.
      //
      // `insensitiveEquals`, not a bare `equals` + `mode`: that pair compiles to
      // an unescaped ILIKE, so the `_` this route's own validation allows in a
      // name was a wildcard, and asking for "new_user" while the account
      // "newXuser" existed came back 409 for a name nobody held (#1055). The rows
      // are narrowed by hand below too - see lib/username-match.ts.
      const candidateHolders = await prisma.users.findMany({
        where: {
          username: insensitiveEquals(nextUsername),
          NOT: {
            id: session.user.id,
          },
        },
        select: { id: true, username: true, isGuest: true },
      })

      const usernameHolders = candidateHolders.filter((row) => sameName(row.username, nextUsername))

      // A real account decides the answer whatever order the rows came back in.
      if (usernameHolders.some((row) => !row.isGuest)) {
        throw new ConflictError('Username is already taken')
      }

      // Same rule as registration (#1050): a guest display name does not reserve
      // a username against a real account, so the guest is renamed instead. Kept
      // in step with GET /api/user/check-username, which this page polls and
      // which no longer counts guest rows as taken.
      //
      // Only an exact-case match can collide with the unique index, so that is
      // the only guest worth moving: a guest called "denys" is left alone when
      // the caller asks for "DENYS", because nothing is in the way.
      guestHoldingUsername = usernameHolders.find((row) => row.username === nextUsername) ?? null
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
      // Same wildcard as the username lookup above, and an address is far likelier
      // to contain an underscore than a display name: "a_b@x.com" matched
      // "aXb@x.com" and refused an address nobody had registered (#1055).
      const emailCandidates = await prisma.users.findMany({
        where: {
          NOT: { id: session.user.id },
          OR: [
            { email: insensitiveEquals(nextEmail) },
            { pendingEmail: insensitiveEquals(nextEmail) },
          ],
        },
        select: { id: true, email: true, pendingEmail: true },
      })

      const existingEmail = emailCandidates.some(
        (row) => sameName(row.email, nextEmail) || sameName(row.pendingEmail, nextEmail)
      )

      if (existingEmail) {
        throw new ConflictError('Email is already in use')
      }

      const refused = await refuseEmailChange(
        req,
        currentUser.passwordHash,
        session.user.authenticatedAt,
        body.currentPassword
      )
      if (refused) {
        return refused
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

  const writeProfile = () => prisma.$transaction(async (tx) => {
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
        passwordHash: true,
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

  let updateResult: Awaited<ReturnType<typeof writeProfile>>

  try {
    // The guest is renamed here and nowhere else, so the only code that can run
    // between the rename and the write that needs it is the write itself, and
    // anything that throws inside hands the name back. #1050 restored the name
    // from the P2002 branch below, which covered the write losing its race and
    // nothing else (#1055).
    updateResult = await withGuestUsernameReleased(guestHoldingUsername, writeProfile)
  } catch (error) {
    // The guest name could not be freed, so it is genuinely held by someone else
    // by now - the same answer the checks above would have given.
    if (error instanceof UsernameUnavailableError) {
      throw new ConflictError('Username is already taken')
    }

    // The write can still lose a race the checks above passed - another request
    // takes the same username, or puts the same address in pendingEmail, between
    // the lookup and this update. That is a conflict the caller can act on, and
    // it reached withErrorHandler unrecognised before, which maps anything with
    // no statusCode to 500.
    if (prismaErrorCode(error) !== 'P2002') {
      throw error
    }

    // Prisma names the columns in meta.target, but not always - fall back to
    // whichever field this request was actually writing.
    const fields = uniqueConstraintFields(error)
    const onEmail = fields.includes('pendingemail') || fields.includes('email')
    const onUsername = fields.includes('username')

    throw new ConflictError(
      onUsername || (!onEmail && updateData.username !== undefined)
        ? 'Username is already taken'
        : 'Email is already in use'
    )
  }

  if (updateResult.verificationToken && updateResult.user.pendingEmail) {
    await sendVerificationEmail(
      updateResult.user.pendingEmail,
      updateResult.verificationToken,
      updateResult.user.username || currentUser.username || 'User'
    )

    // The address being replaced hears about it too (#1136). Before this, only
    // the new address was mailed, so a takeover through this route was silent
    // for the owner. The result is logged, never thrown: the change itself
    // has already been written.
    if (currentUser.email) {
      const notice = await sendEmailChangeNoticeEmail(
        currentUser.email,
        updateResult.user.pendingEmail,
        updateResult.user.username || currentUser.username
      )
      if (!notice.success) {
        log.warn('Email change notice to the previous address was not sent', {
          userId: session.user.id,
          error: notice.error,
        })
      }
    }
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
  return getProfileHandler(req)
})

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const rl = await limiter(req)
  if (rl) return rl
  return patchProfileHandler(req)
})
