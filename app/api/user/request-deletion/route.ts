import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserOrThrow } from '@/lib/session-user'
import { prisma } from '@/lib/db'
import { sendAccountDeletionEmail } from '@/lib/email'
import { emailLanguageFor } from '@/lib/email-language'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { apiLogger } from '@/lib/logger'
import { issueRandomHexToken } from '@/lib/auth-tokens'
import { clearRoleConnection } from '@/lib/discord/role-connection'
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'

const limiter = rateLimit(rateLimitPresets.auth)
const log = apiLogger('/api/user/request-deletion')

async function requestDeletionHandler(req: NextRequest) {
  const rateLimitResult = await limiter(req)
  if (rateLimitResult) {
    return rateLimitResult
  }

  // allowSuspended: a suspended account keeps its right to erasure (GDPR
  // Art. 17), so this route is the one place the suspension does not apply.
  const { session } = await getSessionUserOrThrow(req, { allowSuspended: true })

  if (!session.user.email) {
    throw new AuthenticationError('Unauthorized')
  }

  const user = await prisma.users.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      username: true,
      language: true,
      bot: true, // Bot relation
    },
  })

  if (!user) {
    throw new NotFoundError('User')
  }

  if (user.bot) {
    throw new ValidationError('Bot accounts cannot be deleted this way')
  }

  if (!user.email) {
    throw new ValidationError('Email is required for account deletion')
  }

  // Only the hash is stored, and `purpose` keeps it out of the reset route (#1141).
  const { token, tokenHash } = issueRandomHexToken()
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.passwordResetTokens.create({
    data: {
      userId: user.id,
      tokenHash,
      purpose: 'delete',
      expires,
    },
  })

  // Send deletion confirmation email
  await sendAccountDeletionEmail(user.email, token, user.username || 'User', emailLanguageFor(user.language, req))

  // The plan clears the Discord Linked Roles metadata at the request, not only at the
  // confirmed deletion: the person has said they are leaving, and the roles are the one
  // visible Boardly footprint outside the site. Never throws. If the deletion is never
  // confirmed, the nightly discord-role-sync cron pushes the metadata back (#939).
  const cleared = await clearRoleConnection(user.id)

  // userId only: the email is exactly what this request asks us to erase (#1128).
  log.info('Account deletion requested', {
    userId: user.id,
    discordRoleConnection: cleared.status,
  })

  return NextResponse.json({
    success: true,
    message: 'Deletion confirmation email sent',
  })
}

export const POST = withErrorHandler(requestDeletionHandler)
