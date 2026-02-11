import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  withErrorHandler,
} from '@/lib/error-handler'

const log = apiLogger('Merge Accounts')

/**
 * POST /api/user/merge-accounts
 * Merges OAuth account from one user to another (current logged-in user)
 */
async function mergeAccountsHandler(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  const body = await request.json()
  const { provider, providerAccountId, confirmed } = body

  if (!provider || !providerAccountId) {
    throw new ValidationError('Missing required fields')
  }

  if (!confirmed) {
    throw new ValidationError('Merge must be confirmed')
  }

  const currentUserId = session.user.id

  // Find the OAuth account
  const oauthAccount = await prisma.accounts.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId,
      },
    },
    include: {
      user: true,
    },
  })

  if (!oauthAccount) {
    throw new NotFoundError('OAuth account')
  }

  const sourceUserId = oauthAccount.userId

  if (sourceUserId === currentUserId) {
    throw new ValidationError('Account is already linked to your profile')
  }

  // Start transaction to merge accounts
  await prisma.$transaction(async (tx) => {
    // 1. Move all accounts from source user to current user
    await tx.accounts.updateMany({
      where: { userId: sourceUserId },
      data: { userId: currentUserId },
    })

    // 2. Move all players from source user to current user
    await tx.players.updateMany({
      where: { userId: sourceUserId },
      data: { userId: currentUserId },
    })

    // 3. Update lobbies where source user was creator
    await tx.lobbies.updateMany({
      where: { creatorId: sourceUserId },
      data: { creatorId: currentUserId },
    })

    // 4. Delete the source user (cascade will handle remaining relations)
    await tx.users.delete({
      where: { id: sourceUserId },
    })
  })

  log.info('Successfully merged accounts', {
    fromUserId: sourceUserId,
    toUserId: currentUserId,
    provider,
  })

  return NextResponse.json({
    success: true,
    message: 'Accounts merged successfully',
  })
}

export const POST = withErrorHandler(mergeAccountsHandler)
