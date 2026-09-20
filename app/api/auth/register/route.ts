import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/email'
import { nanoid } from 'nanoid'
import { apiLogger } from '@/lib/logger'
import { registerSchema } from '@/lib/validation/auth'
import { getSignupSourceFromRequest } from '@/lib/signup-source'
import { releaseGuestUsername } from '@/lib/guest-helpers'
import { z } from 'zod'

const limiter = rateLimit(rateLimitPresets.auth)

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await limiter(request)
  if (rateLimitResult) {
    return rateLimitResult
  }

  try {
    const body = await request.json()
    const { email, username, password } = registerSchema.parse(body)

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
    const conflicts = await prisma.users.findMany({
      where: {
        OR: [
          {
            email: {
              equals: email,
              mode: 'insensitive',
            },
          },
          {
            username: {
              equals: username,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: { id: true, email: true, username: true, isGuest: true },
    })

    // registerSchema lowercases the email, so this compares like for like.
    const emailTaken = conflicts.some((row) => row.email?.toLowerCase() === email)

    // `some`/`find` rather than a single `find` over the whole set: a row matching
    // on email must not be read as the holder of the username, and a real account
    // must decide the answer whatever order the rows came back in.
    const usernameHolders = conflicts.filter(
      (row) => row.username?.toLowerCase() === username.toLowerCase()
    )
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

    if (
      guestHoldingUsername &&
      !(await releaseGuestUsername(guestHoldingUsername.id, guestHoldingUsername.username))
    ) {
      // The rename lost a race, so by now the name genuinely is taken by someone
      // other than the guest we were about to move aside.
      return NextResponse.json(
        { error: 'Email or username already exists' },
        { status: 400 }
      )
    }

    // Create user
    const passwordHash = await hashPassword(password)

    let user
    try {
      user = await prisma.users.create({
        data: {
          email,
          username,
          passwordHash,
          signupSource: getSignupSourceFromRequest(request),
          // emailVerified will be set when user clicks verification link
        },
      })
    } catch (createError: unknown) {
      // Two signups racing for the same name reach the unique index rather than
      // the check above. That is a conflict, not a server fault, and it used to
      // fall through to the 500 below - which a visitor cannot act on.
      if (typeof createError === 'object' && createError !== null && (createError as Record<string, unknown>).code === 'P2002') {
        return NextResponse.json(
          { error: 'Email or username already exists' },
          { status: 400 }
        )
      }
      throw createError
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

    // Send verification email
    const emailResult = await sendVerificationEmail(email, verificationToken)
    
    if (!emailResult.success) {
      const log = apiLogger('POST /api/auth/register')
      log.error('Failed to send verification email', undefined, { error: emailResult.error })
      // Continue anyway - user can request resend
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
