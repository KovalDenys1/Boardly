import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { getGuestClaimsFromRequest } from '@/lib/guest-auth'
import { apiLogger } from '@/lib/logger'
import { AuthenticationError, ValidationError, withErrorHandler } from '@/lib/error-handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const log = apiLogger('POST /api/user/upgrade-guest')

type PlayerMigrationRow = {
  id: string
  gameId: string
  score: number
  finalScore: number | null
  placement: number | null
  isWinner: boolean
  isReady: boolean
  scorecard: string | null
}

type UpgradeGuestResult = {
  migrated: boolean
  alreadyMigrated: boolean
  guestUserId: string
  targetUserId: string
  movedPlayers: number
  mergedPlayerConflicts: number
  movedLobbies: number
  movedInvites: number
  movedNotifications: number
  mergedNotificationPreferences: boolean
}

type TransactionClient = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$extends' | '$on' | '$transaction' | '$use'
>

function mergePlayerConflictData(
  targetPlayer: PlayerMigrationRow,
  sourcePlayer: PlayerMigrationRow
) {
  return {
    score: Math.max(targetPlayer.score, sourcePlayer.score),
    finalScore: targetPlayer.finalScore ?? sourcePlayer.finalScore,
    placement: targetPlayer.placement ?? sourcePlayer.placement,
    isWinner: targetPlayer.isWinner || sourcePlayer.isWinner,
    isReady: targetPlayer.isReady || sourcePlayer.isReady,
    scorecard: targetPlayer.scorecard ?? sourcePlayer.scorecard,
  }
}

async function upgradeGuestInTransaction(
  tx: TransactionClient,
  guestUserId: string,
  targetUserId: string
): Promise<UpgradeGuestResult> {
  const sourceGuestUser = await tx.users.findUnique({
    where: { id: guestUserId },
    select: {
      id: true,
      isGuest: true,
    },
  })

  if (!sourceGuestUser) {
    return {
      migrated: false,
      alreadyMigrated: true,
      guestUserId,
      targetUserId,
      movedPlayers: 0,
      mergedPlayerConflicts: 0,
      movedLobbies: 0,
      movedInvites: 0,
      movedNotifications: 0,
      mergedNotificationPreferences: false,
    }
  }

  if (!sourceGuestUser.isGuest) {
    throw new ValidationError('Provided token does not belong to a guest account')
  }

  const sourcePlayers = await tx.players.findMany({
    where: { userId: guestUserId },
    select: {
      id: true,
      gameId: true,
      score: true,
      finalScore: true,
      placement: true,
      isWinner: true,
      isReady: true,
      scorecard: true,
    },
  })

  const uniqueSourceGameIds = Array.from(new Set(sourcePlayers.map((player) => player.gameId)))
  let mergedPlayerConflicts = 0

  if (uniqueSourceGameIds.length > 0) {
    const targetPlayers = await tx.players.findMany({
      where: {
        userId: targetUserId,
        gameId: {
          in: uniqueSourceGameIds,
        },
      },
      select: {
        id: true,
        gameId: true,
        score: true,
        finalScore: true,
        placement: true,
        isWinner: true,
        isReady: true,
        scorecard: true,
      },
    })

    const targetPlayersByGameId = new Map(targetPlayers.map((player) => [player.gameId, player]))
    const conflictingSourcePlayerIds: string[] = []

    for (const sourcePlayer of sourcePlayers) {
      const targetPlayer = targetPlayersByGameId.get(sourcePlayer.gameId)
      if (!targetPlayer) {
        continue
      }

      conflictingSourcePlayerIds.push(sourcePlayer.id)
      mergedPlayerConflicts += 1

      await tx.players.update({
        where: { id: targetPlayer.id },
        data: mergePlayerConflictData(targetPlayer, sourcePlayer),
      })
    }

    if (conflictingSourcePlayerIds.length > 0) {
      await tx.players.deleteMany({
        where: {
          id: {
            in: conflictingSourcePlayerIds,
          },
        },
      })
    }
  }

  const movedPlayersResult = await tx.players.updateMany({
    where: { userId: guestUserId },
    data: { userId: targetUserId },
  })

  const movedLobbiesResult = await tx.lobbies.updateMany({
    where: { creatorId: guestUserId },
    data: { creatorId: targetUserId },
  })

  const movedInvitesAsInviter = await tx.lobbyInvites.updateMany({
    where: { inviterId: guestUserId },
    data: { inviterId: targetUserId },
  })
  const movedInvitesAsInvitee = await tx.lobbyInvites.updateMany({
    where: { inviteeId: guestUserId },
    data: { inviteeId: targetUserId },
  })

  const movedNotificationsResult = await tx.notifications.updateMany({
    where: { userId: guestUserId },
    data: { userId: targetUserId },
  })

  let mergedNotificationPreferences = false
  const sourceNotificationPreferences = await tx.notificationPreferences.findUnique({
    where: { userId: guestUserId },
  })

  if (sourceNotificationPreferences) {
    const targetNotificationPreferences = await tx.notificationPreferences.findUnique({
      where: { userId: targetUserId },
    })

    if (targetNotificationPreferences) {
      await tx.notificationPreferences.update({
        where: { userId: targetUserId },
        data: {
          inAppNotifications:
            targetNotificationPreferences.inAppNotifications || sourceNotificationPreferences.inAppNotifications,
          gameInvites: targetNotificationPreferences.gameInvites || sourceNotificationPreferences.gameInvites,
          turnReminders: targetNotificationPreferences.turnReminders || sourceNotificationPreferences.turnReminders,
          friendRequests: targetNotificationPreferences.friendRequests || sourceNotificationPreferences.friendRequests,
          friendAccepted: targetNotificationPreferences.friendAccepted || sourceNotificationPreferences.friendAccepted,
          unsubscribedAll:
            targetNotificationPreferences.unsubscribedAll || sourceNotificationPreferences.unsubscribedAll,
        },
      })
      await tx.notificationPreferences.delete({
        where: { userId: guestUserId },
      })
      mergedNotificationPreferences = true
    } else {
      await tx.notificationPreferences.update({
        where: { userId: guestUserId },
        data: { userId: targetUserId },
      })
    }
  }

  await tx.users.delete({
    where: { id: guestUserId },
  })

  return {
    migrated: true,
    alreadyMigrated: false,
    guestUserId,
    targetUserId,
    movedPlayers: movedPlayersResult.count,
    mergedPlayerConflicts,
    movedLobbies: movedLobbiesResult.count,
    movedInvites: movedInvitesAsInviter.count + movedInvitesAsInvitee.count,
    movedNotifications: movedNotificationsResult.count,
    mergedNotificationPreferences,
  }
}

async function upgradeGuestHandler(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    throw new AuthenticationError('Unauthorized')
  }

  const guestClaims = getGuestClaimsFromRequest(request)
  if (!guestClaims?.guestId) {
    throw new ValidationError('Missing or invalid guest token')
  }

  const targetUserId = session.user.id
  const guestUserId = guestClaims.guestId

  if (guestUserId === targetUserId) {
    return NextResponse.json({
      success: true,
      migrated: false,
      alreadyMigrated: true,
      guestUserId,
      targetUserId,
      movedPlayers: 0,
      mergedPlayerConflicts: 0,
      movedLobbies: 0,
      movedInvites: 0,
      movedNotifications: 0,
      mergedNotificationPreferences: false,
    })
  }

  const result = await prisma.$transaction((tx) =>
    upgradeGuestInTransaction(tx, guestUserId, targetUserId)
  )

  log.info('Guest account upgrade processed', {
    guestUserId,
    targetUserId,
    migrated: result.migrated,
    alreadyMigrated: result.alreadyMigrated,
    movedPlayers: result.movedPlayers,
    mergedPlayerConflicts: result.mergedPlayerConflicts,
    movedLobbies: result.movedLobbies,
    movedInvites: result.movedInvites,
    movedNotifications: result.movedNotifications,
    mergedNotificationPreferences: result.mergedNotificationPreferences,
  })

  return NextResponse.json({
    success: true,
    ...result,
  })
}

export const POST = withErrorHandler(upgradeGuestHandler)
