import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { clearRoleConnection } from '@/lib/discord/role-connection'
import {
  AppError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'
import { getSessionUserOrThrow } from '@/lib/session-user'
import { LAST_SIGN_IN_METHOD_CODE } from '@/lib/linked-accounts'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/linked-accounts')

async function getLinkedAccountsHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const { session } = await getSessionUserOrThrow(req)
  if (!session.user.email) {
    throw new AuthenticationError('Unauthorized')
  }

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      accounts: {
        select: {
          provider: true,
          providerAccountId: true,
          id: true,
        },
      },
    },
  })

  if (!user) {
    throw new NotFoundError('User')
  }

  // Map accounts by provider
  const linkedAccounts = {
    google: user.accounts.find((a) => a.provider === 'google'),
    github: user.accounts.find((a) => a.provider === 'github'),
    discord: user.accounts.find((a) => a.provider === 'discord'),
  }

  return NextResponse.json({ linkedAccounts })
}

async function deleteLinkedAccountHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  const { session } = await getSessionUserOrThrow(req)
  if (!session.user.email) {
    throw new AuthenticationError('Unauthorized')
  }

  const { provider } = await req.json()

  if (!provider) {
    throw new ValidationError('Provider is required')
  }

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      passwordHash: true,
      accounts: {
        select: { provider: true, id: true },
      },
    },
  })

  if (!user) {
    throw new NotFoundError('User')
  }

  // Prevent unlinking if it's the only auth method. There is no set-password page and,
  // since #1140, no way to link another provider, so the message names the one path
  // that exists: "Forgot password?" sets a password on an account that has none
  // (app/api/auth/reset-password writes passwordHash either way). The profile shows
  // its own translation of this, keyed on the code.
  if (!user.passwordHash && user.accounts.length === 1) {
    throw new AppError(
      'This is the only way you sign in, so it cannot be removed. To add a password, sign out, choose "Forgot password?" on the sign-in page and enter your account\'s email address. Then you can remove this one.',
      400,
      LAST_SIGN_IN_METHOD_CODE
    )
  }

  const account = user.accounts.find((a) => a.provider === provider)

  if (!account) {
    throw new AppError('Account not linked', 404, 'NOT_FOUND')
  }

  // Empty the Linked Roles metadata while the token still exists: after the row is gone
  // there is nothing left to authenticate the write with, and the Discord roles would stay
  // granted (#939). Never throws; a Discord failure must not keep the account linked.
  if (provider === 'discord') {
    const cleared = await clearRoleConnection(user.id)
    log.info('Discord role connection clear before unlink', { userId: user.id, status: cleared.status })
  }

  await prisma.accounts.delete({
    where: { id: account.id },
  })

  log.info('Account unlinked', {
    userId: user.id,
    provider,
  })

  return NextResponse.json({
    success: true,
    message: 'Account unlinked successfully',
  })
}

export const GET = withErrorHandler(getLinkedAccountsHandler)
export const DELETE = withErrorHandler(deleteLinkedAccountHandler)
