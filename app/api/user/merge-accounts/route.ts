import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'

const log = apiLogger('Merge Accounts')

/**
 * POST /api/user/merge-accounts
 * Merges OAuth account from one user to another (current logged-in user)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { provider, providerAccountId, confirmed } = body

    if (!provider || !providerAccountId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (!confirmed) {
      return NextResponse.json(
        { error: 'Merge must be confirmed' },
        { status: 400 }
      )
    }

    const currentUserId = session.user.id

    // Find the OAuth account
    const oauthAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId
        }
      },
      include: {
        user: true
      }
    })

    if (!oauthAccount) {
      return NextResponse.json(
        { error: 'OAuth account not found' },
        { status: 404 }
      )
    }

    const sourceUserId = oauthAccount.userId
    
    if (sourceUserId === currentUserId) {
      return NextResponse.json(
        { error: 'Account is already linked to your profile' },
        { status: 400 }
      )
    }

    // Start transaction to merge accounts
    await prisma.$transaction(async (tx) => {
      // 1. Move all accounts from source user to current user
      await tx.account.updateMany({
        where: { userId: sourceUserId },
        data: { userId: currentUserId }
      })

      // 2. Move all players from source user to current user
      await tx.player.updateMany({
        where: { userId: sourceUserId },
        data: { userId: currentUserId }
      })

      // 3. Update lobbies where source user was creator
      await tx.lobby.updateMany({
        where: { creatorId: sourceUserId },
        data: { creatorId: currentUserId }
      })

      // 4. Move statistics if exists
      const sourceStats = await tx.userStatistics.findUnique({
        where: { userId: sourceUserId }
      })
      
      if (sourceStats) {
        const currentStats = await tx.userStatistics.findUnique({
          where: { userId: currentUserId }
        })

        if (currentStats) {
          // Merge statistics
          await tx.userStatistics.update({
            where: { userId: currentUserId },
            data: {
              totalGames: currentStats.totalGames + sourceStats.totalGames,
              totalWins: currentStats.totalWins + sourceStats.totalWins,
            }
          })
          
          // Delete source stats
          await tx.userStatistics.delete({
            where: { userId: sourceUserId }
          })
        } else {
          // Just move stats to current user
          await tx.userStatistics.update({
            where: { userId: sourceUserId },
            data: { userId: currentUserId }
          })
        }
      }

      // 5. Delete the source user (cascade will handle remaining relations)
      await tx.user.delete({
        where: { id: sourceUserId }
      })
    })

    log.info('Successfully merged accounts', {
      fromUserId: sourceUserId,
      toUserId: currentUserId,
      provider
    })

    return NextResponse.json({
      success: true,
      message: 'Accounts merged successfully'
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error('Failed to merge accounts')
    console.error('Account merge error:', errorMessage)
    return NextResponse.json(
      { error: 'Failed to merge accounts' },
      { status: 500 }
    )
  }
}
