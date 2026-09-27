import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
import { refuseIfBot } from '@/lib/bot-protection'
import { z } from 'zod'
import {
  createGuestId,
  createGuestToken,
  getGuestTokenFromRequest,
  verifyGuestToken,
} from '@/lib/guest-auth'
import { getOrCreateGuestUser } from '@/lib/guest-helpers'
import { getSignupSourceFromRequest } from '@/lib/signup-source'
import { createGameEngine, DEFAULT_GAME_TYPE, isSupportedGameType } from '@/lib/game-registry'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { getFinishedGameHumanRoster } from '@/lib/lobby-series-transition'
import {
  hashLobbyPassword,
  isHashedLobbyPassword,
  verifyLobbyPassword,
} from '@/lib/lobby-password'
import { toPersistedGameType } from '@/lib/game-type-storage'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { recordLobbyParticipation } from '@/lib/lobby-participation'
import type { LobbyJoinRefusalCode } from '@/lib/lobby-join-errors'

// One bucket per IP across every lobby code (#1157): the code is in the path, so the
// old per-path key gave each of the 10,000 codes a fresh allowance.
const limiter = rateLimit(rateLimitPresets.lobbyJoinGuest)
// A join without a valid token for a guest that still exists mints a Users row, so it gets
// guest-session's budget.
const newGuestLimiter = rateLimit(rateLimitPresets.lobbyJoinNewGuest)
const joinGuestSchema = z.object({
  guestName: z.string().trim().min(2).max(20),
  guestToken: z.string().optional(),
  password: z.string().optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const log = apiLogger('POST /api/lobby/[code]/join-guest')

  try {
    // Rate limit join requests
    const rateLimitResult = await limiter(req)
    if (rateLimitResult) return rateLimitResult

    const { code } = await params
    const parsedBody = joinGuestSchema.safeParse(await req.json())
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Guest name must be 2-20 characters' }, { status: 400 })
    }

    const providedToken = parsedBody.data.guestToken || getGuestTokenFromRequest(req)
    const verifiedGuestClaims = providedToken ? verifyGuestToken(providedToken) : null
    const requestedGuestName = parsedBody.data.guestName

    // A validly signed token only counts if its guest still exists. One naming a guest that
    // was erased with "Forget me" or purged used to re-create the row under the same id,
    // undoing the erasure (#1129) and minting outside the new-guest budget below (#1157).
    // guest-session answers such a token 404; this visitor is mid-join, so they are treated
    // as arriving without one: a fresh guest, counted as one, whose token the client stores.
    const existingGuestClaims =
      verifiedGuestClaims &&
      (await prisma.users.findFirst({
        where: { id: verifiedGuestClaims.guestId, isGuest: true },
        select: { id: true },
      }))
        ? verifiedGuestClaims
        : null

    if (!existingGuestClaims) {
      const newGuestRateLimitResult = await newGuestLimiter(req)
      if (newGuestRateLimitResult) return newGuestRateLimitResult

      // Only a join that mints a guest is checked (#1157): a guest who already exists has
      // passed guest-session or an earlier join, and their rejoins are gameplay.
      const botRefusal = await refuseIfBot('POST /api/lobby/[code]/join-guest')
      if (botRefusal) return botRefusal
    }

    // The id the guest row has or will have (getOrCreateGuestUser creates it under exactly
    // this id), so every refusal below can be decided before any row is written (#1157).
    const guestId = existingGuestClaims?.guestId || createGuestId()

    // Find the lobby. Active ones only: lobby rows are deactivated by the sweeps, never
    // deleted, so without the filter every lobby ever created was a live join target.
    const lobby = await prisma.lobbies.findUnique({
      where: { code, isActive: true },
      // kickedUserIds is omitted globally (lib/db.ts); this route is one of the two that
      // has to honour it, so it asks for it back by name.
      omit: { kickedUserIds: false },
      include: {
        games: {
          where: {
            status: {
              in: ['waiting', 'playing'],
            },
          },
          orderBy: {
            updatedAt: 'desc',
          },
          include: {
            players: true,
          },
        },
      },
    })

    if (!lobby) {
      return NextResponse.json({ error: 'Lobby not found' }, { status: 404 })
    }

    if (lobby.password) {
      const isPasswordValid = await verifyLobbyPassword(lobby.password, parsedBody.data.password)
      if (!isPasswordValid) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 })
      }

      // Upgrade legacy plain-text lobby passwords after a successful match.
      if (!isHashedLobbyPassword(lobby.password)) {
        const upgradedHash = await hashLobbyPassword(parsedBody.data.password)
        if (upgradedHash) {
          try {
            await prisma.lobbies.update({
              where: { id: lobby.id },
              data: { password: upgradedHash },
            })
          } catch (upgradeError) {
            log.warn('Failed to upgrade legacy lobby password hash for guest join', {
              lobbyId: lobby.id,
              error: (upgradeError as Error).message,
            })
          }
        }
      }
    }

    const signupSource = getSignupSourceFromRequest(req)
    // Every check that can refuse the join runs before this is called, so a kicked guest, a
    // running game or a full lobby no longer mints a Users row per request (#1157).
    // Only a freshly minted id creates a row; a token holder's row is found or, if it went
    // since the check above, not re-created (null).
    const resolveGuestUser = async () => {
      const guestUser = existingGuestClaims
        ? await getOrCreateGuestUser(guestId, requestedGuestName, signupSource, {
            createIfMissing: false,
          })
        : await getOrCreateGuestUser(guestId, requestedGuestName, signupSource)
      if (!guestUser) return null
      const guestName = guestUser.username || requestedGuestName
      return { guestUser, guestName, guestToken: createGuestToken(guestUser.id, guestName) }
    }
    const guestGone = () =>
      NextResponse.json({ error: 'Guest not found', code: 'GUEST_NOT_FOUND' }, { status: 404 })

    // The guest id is carried in the token and survives the redirect, so a kicked guest comes
    // back as the same user — and the lobby refuses them, exactly as it refuses a kicked
    // account (#1013). Checked before the already-in-lobby lookup: their Players row is gone.
    if (lobby.kickedUserIds.includes(guestId)) {
      return NextResponse.json(
        { error: 'The host removed you from this lobby', code: 'KICKED_FROM_LOBBY' },
        { status: 403 }
      )
    }

    const activeGame = pickRelevantLobbyGame(lobby.games)

    // Check if guest is already in the lobby
    if (activeGame) {
      const existingPlayer = activeGame.players.find(
        (p) => p.userId === guestId
      )
      if (existingPlayer) {
        const resolved = await resolveGuestUser()
        if (!resolved) return guestGone()
        const { guestUser, guestName, guestToken } = resolved
        return NextResponse.json(
          {
            message: 'Already in lobby',
            player: existingPlayer,
            guestId: guestUser.id,
            guestName,
            guestToken,
          },
          { status: 200 }
        )
      }
    }

    // A running game does not take newcomers (#879). Without this the guest is written
    // as a Players row the engine's state never learns about: they land on "You're not
    // part of this match" while occupying a seat and counting toward "full". The rejoin
    // path above already returned, so reaching here with `playing` means a stranger.
    if (activeGame && activeGame.status === 'playing') {
      return NextResponse.json(
        {
          error: 'Game in progress',
          code: 'GAME_IN_PROGRESS' satisfies LobbyJoinRefusalCode,
          allowSpectators: lobby.allowSpectators,
        },
        { status: 409 }
      )
    }

    // Check if lobby is full
    if (activeGame && activeGame.players.length >= lobby.maxPlayers) {
      return NextResponse.json(
        { error: 'Lobby is full', code: 'LOBBY_FULL' satisfies LobbyJoinRefusalCode },
        { status: 400 }
      )
    }

    // Create or get the active game
    let game
    let joined: NonNullable<Awaited<ReturnType<typeof resolveGuestUser>>>
    if (!activeGame) {
      const requestedGameType = lobby.gameType || DEFAULT_GAME_TYPE
      if (!isSupportedGameType(requestedGameType)) {
        return NextResponse.json({ error: 'Unsupported lobby game type' }, { status: 400 })
      }
      const runtimeGameType = requestedGameType
      const initialState = createGameEngine(runtimeGameType, 'temp').getState()

      // Same hole as the authenticated join (#1005): a finished game is invisible to the
      // query above, so this branch opened a bare room that outranked it and everyone
      // still on the results screen was swapped into an empty board. Carry the previous
      // match over, then seat the guest behind it.
      const carriedUserIds = await getFinishedGameHumanRoster(
        prisma,
        lobby.id,
        lobby.kickedUserIds
      )
      const rosterUserIds = carriedUserIds.includes(guestId)
        ? carriedUserIds
        : [...carriedUserIds, guestId]

      if (rosterUserIds.length > lobby.maxPlayers) {
        return NextResponse.json(
        { error: 'Lobby is full', code: 'LOBBY_FULL' satisfies LobbyJoinRefusalCode },
        { status: 400 }
      )
      }

      // Minted only now that the join is going to happen: the Players rows below need it.
      const minted = await resolveGuestUser()
      if (!minted) return guestGone()
      joined = minted

      game = await prisma.games.create({
        data: {
          lobbyId: lobby.id,
          gameType: toPersistedGameType(runtimeGameType),
          status: 'waiting',
          state: toPersistedGameStateInput(initialState),
          players: {
            create: rosterUserIds.map((rosterUserId, position) => ({
              userId: rosterUserId,
              position,
            })),
          },
        },
        include: {
          players: {
            include: {
              user: true,
            },
          },
        },
      })

      // The fresh-game branch never wrote a participation row (#920).
      await recordLobbyParticipation({
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        gameType: toPersistedGameType(runtimeGameType),
        userId: joined.guestUser.id,
        isGuest: true,
        signupSource,
      })
    } else {
      // Add guest player to existing game
      const minted = await resolveGuestUser()
      if (!minted) return guestGone()
      joined = minted
      const nextPosition = activeGame.players.length
      await prisma.players.create({
        data: {
          gameId: activeGame.id,
          userId: joined.guestUser.id,
          position: nextPosition,
        },
      })

      await recordLobbyParticipation({
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        gameType: activeGame.gameType,
        userId: joined.guestUser.id,
        isGuest: true,
        signupSource,
      })

      // Refresh game data
      const refreshedGame = await prisma.games.findUnique({
        where: { id: activeGame.id },
        include: { 
          players: {
            include: {
              user: true,
            },
          },
        },
      })

      if (!refreshedGame) {
        return NextResponse.json(
          { error: 'Failed to refresh game data' },
          { status: 500 }
        )
      }
      
      game = refreshedGame
    }

    return NextResponse.json(
      {
        message: 'Guest joined successfully',
        game,
        guestId: joined.guestUser.id,
        guestName: joined.guestName,
        guestToken: joined.guestToken,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    log.error('Error joining as guest', error)
    return NextResponse.json(
      { error: 'Failed to join as guest' },
      { status: 500 }
    )
  }
}
