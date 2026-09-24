import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/next-auth'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const log = apiLogger('GET /api/user/export')

// Building the file reads every table the user appears in, so the limit is per hour.
const exportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyScope: 'user-export',
  message: 'Too many export requests. Please try again later.',
})

// A bound on each list, far above any real account, so one request cannot pull an
// unbounded table into memory. A list that reaches it is marked in `truncated`.
const MAX_ROWS = 10_000

function pickTerminalOutcome(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const { outcome, isDraw, reason } = metadata as Record<string, unknown>
  // winnerUserId and playerResults name the other players; the user's own result is
  // already in their Players row.
  return {
    outcome: typeof outcome === 'string' ? outcome : null,
    isDraw: typeof isDraw === 'boolean' ? isDraw : null,
    reason: typeof reason === 'string' ? reason : null,
  }
}

function endpointHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host
  } catch {
    return null
  }
}

/**
 * GET /api/user/export (#1127, GDPR Art. 15 and 20)
 *
 * The signed-in user's own data as a JSON attachment. The user is taken from the session
 * and from nothing else: no query parameter or body can name another account. Other
 * people appear only by the username the user already sees in the app (friends, invites),
 * never by id, email or game state. Secrets are left out: password hash, TOTP secrets,
 * OAuth tokens, push subscription keys.
 */
export async function GET(request: NextRequest) {
  const limited = await exportRateLimit(request)
  if (limited) return limited

  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [
      profile,
      players,
      lobbiesCreated,
      purchaseConsents,
      friendships,
      friendRequests,
      lobbyInvites,
      notifications,
      feedback,
      achievements,
      pushSubscriptions,
    ] = await Promise.all([
      prisma.users.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          pendingEmail: true,
          emailVerified: true,
          username: true,
          friendCode: true,
          publicProfileId: true,
          image: true,
          avatarUrl: true,
          bio: true,
          accentColor: true,
          featuredGame: true,
          premiumCardStyle: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          premiumUntil: true,
          premiumCancelAtPeriod: true,
          premiumFirstGrantedAt: true,
          totpEnabled: true,
          isGuest: true,
          signupSource: true,
          role: true,
          suspended: true,
          banReason: true,
          banExpiresAt: true,
          lastActiveAt: true,
          createdAt: true,
          updatedAt: true,
          accountPreferences: {
            select: {
              profileVisibility: true,
              showOnlineStatus: true,
              onboardingCompletedAt: true,
              onboardingSkippedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          notificationPreferences: {
            select: {
              inAppNotifications: true,
              gameInvites: true,
              turnReminders: true,
              friendRequests: true,
              friendAccepted: true,
              pushNotifications: true,
              unsubscribedAll: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          accounts: {
            select: { provider: true, type: true, providerAccountId: true },
          },
        },
      }),
      prisma.players.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          position: true,
          score: true,
          finalScore: true,
          placement: true,
          isWinner: true,
          scorecard: true,
          leftAt: true,
          createdAt: true,
          game: {
            select: {
              id: true,
              gameType: true,
              status: true,
              createdAt: true,
              startedAt: true,
              endedAt: true,
              durationSeconds: true,
              terminalMetadata: true,
              lobby: { select: { code: true, name: true } },
            },
          },
        },
      }),
      prisma.lobbies.findMany({
        where: { creatorId: userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          code: true,
          name: true,
          gameType: true,
          maxPlayers: true,
          isActive: true,
          createdAt: true,
        },
      }),
      prisma.purchaseConsents.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          checkoutSessionId: true,
          stripeSubscriptionId: true,
          plan: true,
          termsVersion: true,
          withdrawalInfoVersion: true,
          consentAt: true,
          consentReceivedAt: true,
          confirmationSentAt: true,
          createdAt: true,
        },
      }),
      prisma.friendships.findMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
        take: MAX_ROWS,
        select: {
          user1Id: true,
          createdAt: true,
          user1: { select: { username: true } },
          user2: { select: { username: true } },
        },
      }),
      prisma.friendRequests.findMany({
        where: { OR: [{ senderId: userId }, { receiverId: userId }] },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          senderId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          sender: { select: { username: true } },
          receiver: { select: { username: true } },
        },
      }),
      prisma.lobbyInvites.findMany({
        where: { OR: [{ inviterId: userId }, { inviteeId: userId }] },
        orderBy: { sentAt: 'desc' },
        take: MAX_ROWS,
        select: {
          inviterId: true,
          channel: true,
          sentAt: true,
          acceptedAt: true,
          inviter: { select: { username: true } },
          invitee: { select: { username: true } },
          lobby: { select: { code: true } },
        },
      }),
      prisma.notifications.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          type: true,
          channel: true,
          status: true,
          reason: true,
          payload: true,
          readAt: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      prisma.feedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        select: {
          type: true,
          status: true,
          message: true,
          email: true,
          pageUrl: true,
          createdAt: true,
        },
      }),
      prisma.userAchievements.findMany({
        where: { userId },
        orderBy: { unlockedAt: 'asc' },
        take: MAX_ROWS,
        select: { achievementKey: true, unlockedAt: true },
      }),
      prisma.pushSubscriptions.findMany({
        where: { userId },
        take: MAX_ROWS,
        select: { endpoint: true, userAgent: true, createdAt: true },
      }),
    ])

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { accounts, accountPreferences, notificationPreferences, ...account } = profile

    const lists = {
      games: players,
      lobbiesCreated,
      purchaseConsents,
      friends: friendships,
      friendRequests,
      lobbyInvites,
      notifications,
      feedback,
      achievements,
      pushSubscriptions,
    }
    const truncated = Object.entries(lists)
      .filter(([, rows]) => rows.length >= MAX_ROWS)
      .map(([name]) => name)

    const exportedAt = new Date()
    const body = {
      format: 'boardly-user-export',
      version: 1,
      exportedAt: exportedAt.toISOString(),
      account,
      preferences: {
        account: accountPreferences,
        notifications: notificationPreferences,
      },
      linkedSignInProviders: accounts,
      games: players.map(({ game, ...result }) => ({
        gameId: game.id,
        gameType: game.gameType,
        status: game.status,
        lobbyCode: game.lobby?.code ?? null,
        lobbyName: game.lobby?.name ?? null,
        createdAt: game.createdAt,
        startedAt: game.startedAt,
        endedAt: game.endedAt,
        durationSeconds: game.durationSeconds,
        result: pickTerminalOutcome(game.terminalMetadata),
        you: result,
      })),
      lobbiesCreated,
      purchaseConsents,
      friends: friendships.map((friendship) => ({
        username:
          friendship.user1Id === userId ? friendship.user2.username : friendship.user1.username,
        since: friendship.createdAt,
      })),
      friendRequests: friendRequests.map((request) => {
        const sent = request.senderId === userId
        return {
          direction: sent ? 'sent' : 'received',
          otherUsername: sent ? request.receiver.username : request.sender.username,
          status: request.status,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        }
      }),
      lobbyInvites: lobbyInvites.map((invite) => {
        const sent = invite.inviterId === userId
        return {
          direction: sent ? 'sent' : 'received',
          otherUsername: sent ? invite.invitee.username : invite.inviter.username,
          lobbyCode: invite.lobby.code,
          channel: invite.channel,
          sentAt: invite.sentAt,
          acceptedAt: invite.acceptedAt,
        }
      }),
      notifications,
      feedback,
      achievements,
      pushSubscriptions: pushSubscriptions.map((subscription) => ({
        service: endpointHost(subscription.endpoint),
        userAgent: subscription.userAgent,
        createdAt: subscription.createdAt,
      })),
      truncated,
    }

    const fileName = `boardly-data-${exportedAt.toISOString().slice(0, 10)}.json`
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    log.error('Data export failed', error as Error, { userId })
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
