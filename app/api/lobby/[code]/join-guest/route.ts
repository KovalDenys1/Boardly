import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { rateLimit, rateLimitPresets } from '@/lib/rate-limit'
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

const limiter = rateLimit(rateLimitPresets.game)
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
    const existingGuestClaims = providedToken ? verifyGuestToken(providedToken) : null
    const requestedGuestName = parsedBody.data.guestName
    const guestId = existingGuestClaims?.guestId || createGuestId()

    // Find the lobby
    const lobby = await prisma.lobbies.findUnique({
      where: { code },
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
    const guestUser = await getOrCreateGuestUser(guestId, requestedGuestName, signupSource)
    const guestName = guestUser.username || requestedGuestName
    const guestToken = createGuestToken(guestUser.id, guestName)

    // The guest id is carried in the token and survives the redirect, so a kicked guest comes
    // back as the same user — and the lobby refuses them, exactly as it refuses a kicked
    // account (#1013). Checked before the already-in-lobby lookup: their Players row is gone.
    if (lobby.kickedUserIds.includes(guestUser.id)) {
      return NextResponse.json(
        { error: 'The host removed you from this lobby', code: 'KICKED_FROM_LOBBY' },
        { status: 403 }
      )
    }

    const activeGame = pickRelevantLobbyGame(lobby.games)

    // Check if guest is already in the lobby
    if (activeGame) {
      const existingPlayer = activeGame.players.find(
        (p) => p.userId === guestUser.id
      )
      if (existingPlayer) {
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
      const rosterUserIds = carriedUserIds.includes(guestUser.id)
        ? carriedUserIds
        : [...carriedUserIds, guestUser.id]

      if (rosterUserIds.length > lobby.maxPlayers) {
        return NextResponse.json(
        { error: 'Lobby is full', code: 'LOBBY_FULL' satisfies LobbyJoinRefusalCode },
        { status: 400 }
      )
      }

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
        userId: guestUser.id,
        isGuest: true,
        signupSource,
      })
    } else {
      // Add guest player to existing game
      const nextPosition = activeGame.players.length
      await prisma.players.create({
        data: {
          gameId: activeGame.id,
          userId: guestUser.id,
          position: nextPosition,
        },
      })

      await recordLobbyParticipation({
        lobbyId: lobby.id,
        lobbyCode: lobby.code,
        gameType: activeGame.gameType,
        userId: guestUser.id,
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
        guestId: guestUser.id,
        guestName,
        guestToken,
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
