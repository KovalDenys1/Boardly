import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { failClosedAuthPreset, rateLimit } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/email'
import { reserveTransactionalMailSend } from '@/lib/email-send-guard'
import { upsertNotificationPreferences } from '@/lib/notification-preferences'
import { nanoid } from 'nanoid'
import { apiLogger } from '@/lib/logger'
import { registerSchema } from '@/lib/validation/auth'
import { getSignupSourceFromRequest } from '@/lib/signup-source'
import {
  prismaErrorCode,
  UsernameUnavailableError,
  withGuestUsernameReleased,
} from '@/lib/guest-helpers'
import { insensitiveEquals, sameName } from '@/lib/username-match'
import { z } from 'zod'

const limiter = rateLimit(failClosedAuthPreset)

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const body = await request.json()
    const { email, username, password, marketingConsent } = registerSchema.parse(body)

    // Check if user already exists. `findMany`, not `findFirst`: a guest row and a
    // real account can hold the email and the username separately, and the two
    // cases are answered differently below.
    //
    // The username arm is case-insensitive, matching GET /api/user/check-username,
    // which is what the register form polls. `Users_username_key` is a plain btree
    // with no lower(), so the database itself would happily take "DENYS" next to an
    // account called "Denys" - an exact lookup here let a signup claim the
    // case-variant of a real account's name, which is the impersonation the same
    // fix closes in PATCH /api/user/profile. It also means more than one row can
    // come back on the username, which is why the split below exists.
    //
    // `insensitiveEquals` rather than a bare `equals` + `mode`: that pair compiles
    // to an unescaped ILIKE, where the `_` a username may contain is a wildcard
    // (#1055). The rows are still compared by hand below - the filter decides
    // what the database may return, the comparison decides which of those rows
    // answers the question, and lib/username-match.ts has what neither half
    // covers.
    const conflicts = await prisma.users.findMany({
      where: {
        OR: [
          { email: insensitiveEquals(email) },
          { username: insensitiveEquals(username) },
        ],
      },
      select: { id: true, email: true, username: true, isGuest: true },
    })

    // registerSchema lowercases the email, so this compares like for like.
    const emailTaken = conflicts.some((row) => sameName(row.email, email))

    // `some`/`find` rather than a single `find` over the whole set: a row matching
    // on email must not be read as the holder of the username, and a real account
    // must decide the answer whatever order the rows came back in.
    const usernameHolders = conflicts.filter((row) => sameName(row.username, username))
    const usernameTakenByAccount = usernameHolders.some((row) => !row.isGuest)

    // Only an exact-case holder is actually in the way of the insert, so that is
    // the only guest moved aside; a guest called "denys" keeps its name when the
    // signup is for "Denys".
    const guestHoldingUsername = usernameHolders.find((row) => row.isGuest && row.username === username)

    // A guest display name is not an account, and since #1047 a guest who has
    // played is kept for ninety days instead of three - so a visitor called
    // "Denys" in one game blocked that username for a quarter of a year (#1050).
    // The guest gives the name up instead; nothing that identifies them is lost.
    // An email conflict is never resolved this way: it is the one field that
    // really is the person, so it stays a hard rejection whoever holds it.
    if (emailTaken || usernameTakenByAccount) {
      return NextResponse.json(
        { error: 'Email or username already exists' },
        { status: 400 }
      )
    }

    // Hashed before the guest is renamed, not after: bcrypt is the slowest step
    // in this handler, and every millisecond of it spent with the name already
    // freed is a millisecond another signup can take the name out from under us.
    const passwordHash = await hashPassword(password)

    // The guest rename and the insert that needs it are one scope. The rename is
    // its own committed write, so a failure between the two used to leave an
    // uninvolved visitor renamed for a signup that never happened - here the
    // create losing the unique-index race answered 400 and left it that way
    // (#1055). withGuestUsernameReleased hands the name back on any exit.
    let user
    try {
      user = await withGuestUsernameReleased(guestHoldingUsername, () =>
        prisma.users.create({
          data: {
            email,
            username,
            passwordHash,
            signupSource: getSignupSourceFromRequest(request),
            // emailVerified will be set when user clicks verification link
          },
        })
      )
    } catch (error: unknown) {
      // Two signups racing for the same name reach the unique index rather than
      // the check above, and the rename can lose that same race before the insert
      // is even attempted. Both are conflicts, not server faults, and P2002 used
      // to fall through to the 500 below - which a visitor cannot act on.
      if (error instanceof UsernameUnavailableError || prismaErrorCode(error) === 'P2002') {
        return NextResponse.json(
          { error: 'Email or username already exists' },
          { status: 400 }
        )
      }
      throw error
    }

    // #1154: the unticked-by-default checkbox reaching this point true is the consent
    // itself; upsertNotificationPreferences stamps the timestamp that proves it. Only
    // written when checked - unchecked (the default) needs no row, since
    // getNotificationPreferences already answers marketingConsent: false with no row at
    // all. A failure here must never fail a signup that already created the account.
    if (marketingConsent) {
      try {
        await upsertNotificationPreferences(user.id, { marketingConsent: true })
      } catch (err) {
        const log = apiLogger('POST /api/auth/register')
        log.error('Failed to record marketing consent at signup', err instanceof Error ? err : new Error(String(err)), {
          userId: user.id,
        })
      }
    }

    // Generate verification token
    const verificationToken = nanoid(32)
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    await prisma.emailVerificationTokens.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expires: verificationExpiry,
      },
    })

    // Send verification email, unless the address or the day's budget is spent (#1158).
    // The account stands either way; the user can ask for the mail again later.
    const mailDecision = await reserveTransactionalMailSend('verification', email)
    if (!mailDecision.allowed) {
      apiLogger('POST /api/auth/register').warn('Verification mail throttled at registration', {
        userId: user.id,
        reason: mailDecision.reason,
      })
    } else {
      const emailResult = await sendVerificationEmail(email, verificationToken)

      if (!emailResult.success) {
        const log = apiLogger('POST /api/auth/register')
        log.error('Failed to send verification email', undefined, { error: emailResult.error })
        // Continue anyway - user can request resend
      }
    }

    return NextResponse.json({
      message: 'Registration successful! Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email ?? email,
        username: user.username,
        emailVerified: false,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 })
    }
    const log = apiLogger('POST /api/auth/register')
    log.error('Register error', error as Error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
