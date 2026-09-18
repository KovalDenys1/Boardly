import type { Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { apiLogger } from '@/lib/logger'
import { broadcastToLobby } from '@/lib/supabase-server'
import { pickRelevantLobbyGame } from '@/lib/lobby-snapshot'
import { getLobbyPlayerRequirements } from '@/lib/lobby-player-requirements'
import { parseAndValidateGameState, toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { restoreGameEngine } from '@/lib/game-registry'
import { getGameMetadata } from '@/lib/game-catalog'
import { deleteGameTurnReminderNotifications } from '@/lib/in-app-notifications'
import { advanceTurnPastDisconnectedPlayers, setPlayerConnectionInState, type TurnState } from '@/lib/disconnected-turn'

/**
 * Shared by the explicit POST /api/lobby/[code]/leave route and the
 * stale-heartbeat sweep (#675, lib/lobby-presence.ts) — both need the exact
 * same per-game abandon/reassign/turn-advance rules, just triggered by a
 * different signal (an explicit click vs. a client that stopped heartbeating).
 */
export const LOBBY_WITH_GAMES_FOR_LEAVE_INCLUDE = {
  games: {
    orderBy: { updatedAt: 'desc' as const },
    include: {
      players: {
        include: {
          user: true,
        },
      },
    },
  },
} satisfies Prisma.LobbiesInclude

// The omit mirrors the client-level default in lib/db.ts: realtimeSecret never
// comes back unless a query asks for it by name, so a payload type that still
// declared it would not match anything the client actually returns (#845).
export type LobbyWithGamesForLeave = Prisma.LobbiesGetPayload<{
  include: typeof LOBBY_WITH_GAMES_FOR_LEAVE_INCLUDE
  omit: { realtimeSecret: true }
}>

export interface PerformPlayerLeaveResult {
  status: number
  body: {
    message?: string
    error?: string
    gameEnded?: boolean
    gameAbandoned?: boolean
    lobbyDeactivated?: boolean
  }
}

type ReassignedCreator = {
  userId: string
  username: string
}

async function emitLobbyEvent(
  log: ReturnType<typeof apiLogger>,
  code: string,
  event: string,
  data: Record<string, unknown>
) {
  const sent = await broadcastToLobby(code, event, data)
  if (!sent) log.warn('Failed to broadcast lobby leave event', { code, event })
}

/**
 * Cleans up stale turn-reminder notifications for an abandoned game. Awaited
 * (not fire-and-forget) because Vercel can freeze/kill a serverless
 * function's pending promises once the response is sent — a bare `void` call
 * here resurfaces later as an out-of-context DatabaseTimeoutError on an
 * unrelated request (same class of bug #509 fixed for emitLobbyEvent). Errors
 * are swallowed rather than thrown: a missed cleanup just leaves one stale
 * notification row, which must never fail the leave request itself.
 */
async function cleanupTurnReminderNotifications(log: ReturnType<typeof apiLogger>, gameId: string) {
  try {
    await deleteGameTurnReminderNotifications(gameId)
  } catch (error) {
    log.warn('Failed to clean up turn-reminder notifications after game abandonment', {
      gameId,
      error: (error as Error).message,
    })
  }
}

function notifyLobbyListUpdate() {
  // Postgres Changes on Lobbies table handles lobby-list updates globally
}

async function reassignLobbyCreatorIfNeeded(
  log: ReturnType<typeof apiLogger>,
  lobbyId: string,
  gameId: string,
  lobbyCode: string
): Promise<ReassignedCreator | null> {
  const nextCreator = await prisma.players.findFirst({
    where: {
      gameId,
      leftAt: null,
      user: {
        bot: null,
      },
    },
    orderBy: [
      { position: 'asc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    select: {
      userId: true,
      user: {
        select: {
          username: true,
        },
      },
    },
  })

  if (!nextCreator) {
    log.warn('Unable to find replacement lobby creator after leave', {
      lobbyId,
      lobbyCode,
      gameId,
    })
    return null
  }

  await prisma.lobbies.update({
    where: { id: lobbyId },
    data: { creatorId: nextCreator.userId },
  })

  return {
    userId: nextCreator.userId,
    username: nextCreator.user.username || 'Player',
  }
}

/**
 * Removes `userId` from `lobby`'s currently-relevant game and applies every
 * game-specific side effect (abandon, creator reassignment, turn advance,
 * engine handlePlayerLeave, spy-left, etc.) — identical behavior regardless
 * of whether the removal was triggered by an explicit "Leave" click or a
 * stale-heartbeat sweep.
 */
export async function performPlayerLeave(
  lobby: LobbyWithGamesForLeave,
  code: string,
  userId: string,
  log: ReturnType<typeof apiLogger>
): Promise<PerformPlayerLeaveResult> {
  const playerOwnedGame =
    lobby.games.find((game) =>
      game.players.some((p) => p.userId === userId)
    ) || null
  const activeGame = playerOwnedGame || pickRelevantLobbyGame(lobby.games, { includeFinished: true })

  if (!activeGame) {
    return { status: 404, body: { error: 'No active game found' } }
  }

  const player = activeGame.players.find((p) => p.userId === userId)

  if (!player) {
    return {
      status: 200,
      body: {
        message: 'You already left the lobby',
        gameEnded: false,
        lobbyDeactivated: false,
      },
    }
  }

  // Remove player: hard-delete for pre-game (waiting), soft-leave for in-progress/terminal games
  if (activeGame.status === 'waiting') {
    await prisma.players.delete({ where: { id: player.id } })
  } else {
    await prisma.players.update({
      where: { id: player.id },
      data: { leftAt: new Date() },
    })
  }

  // Always filter leftAt:null — waiting games hard-delete so all remaining have leftAt:null;
  // playing/terminal games now use soft-leave so leftAt:null gives active count.
  const [remainingPlayers, remainingHumanPlayers] = await Promise.all([
    prisma.players.count({
      where: { gameId: activeGame.id, leftAt: null },
    }),
    prisma.players.count({
      where: {
        gameId: activeGame.id,
        leftAt: null,
        user: {
          bot: null,
        },
      },
    }),
  ])
  const minPlayersRequired = getLobbyPlayerRequirements(activeGame.gameType).minPlayersRequired

  const creatorLeft = lobby.creatorId === userId
  const isTerminalGame = activeGame.status === 'finished' || activeGame.status === 'abandoned' || activeGame.status === 'cancelled'
  const lobbyCanStayActive =
    activeGame.status === 'playing'
      ? remainingPlayers >= minPlayersRequired && remainingHumanPlayers > 0
      : remainingPlayers > 0 && remainingHumanPlayers > 0
  // Don't reassign creator during post-game — only the original host can start the next game
  const reassignedCreator =
    creatorLeft && lobbyCanStayActive && !isTerminalGame
      ? await reassignLobbyCreatorIfNeeded(log, lobby.id, activeGame.id, code)
      : null

  // Broadcast onto a non-private topic, so an email must never be the fallback
  // for a missing username (#801).
  const departedPlayerName = player.user.username || 'Guest'
  const playerLeftEventPayload = {
    userId,
    playerId: userId,
    username: departedPlayerName,
    playerName: departedPlayerName,
    remainingPlayers,
    ...(reassignedCreator
      ? {
          nextCreatorId: reassignedCreator.userId,
          nextCreatorName: reassignedCreator.username,
        }
      : {}),
  }

  // Different behavior based on game status
  if (activeGame.status === 'waiting') {
    // In waiting state, just remove player
    // If no players or no human players left, deactivate the lobby
    if (remainingPlayers === 0 || remainingHumanPlayers === 0) {
      await prisma.lobbies.update({
        where: { id: lobby.id },
        data: { isActive: false },
      })

      notifyLobbyListUpdate()

      return {
        status: 200,
        body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: true },
      }
    }

    await Promise.all([
      emitLobbyEvent(log, code, 'player-left', playerLeftEventPayload),
      emitLobbyEvent(log, code, 'lobby-update', {
        lobbyCode: code,
        type: 'player-left',
        ...(reassignedCreator
          ? {
              data: {
                creatorId: reassignedCreator.userId,
                creatorName: reassignedCreator.username,
              },
            }
          : {}),
      }),
    ])

    return {
      status: 200,
      body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: false },
    }
  }

  // For terminal games, update lobby membership without mutating the settled result.
  if (
    activeGame.status === 'finished' ||
    activeGame.status === 'abandoned' ||
    activeGame.status === 'cancelled'
  ) {
    if (remainingPlayers === 0 || remainingHumanPlayers === 0) {
      await prisma.lobbies.update({
        where: { id: lobby.id },
        data: { isActive: false },
      })

      notifyLobbyListUpdate()

      return {
        status: 200,
        body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: true },
      }
    }

    await emitLobbyEvent(log, code, 'player-left', {
      ...playerLeftEventPayload,
      ...(creatorLeft ? { hostLeft: true } : {}),
      gameTerminal: true,
    })

    return {
      status: 200,
      body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: false },
    }
  }

  // If game is playing and no human players remain (only bots or empty), end the game
  if (remainingHumanPlayers === 0) {
    const abandonNow = new Date()
    const abandonDuration = activeGame.startedAt instanceof Date
      ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
      : null
    await prisma.games.update({
      where: { id: activeGame.id },
      data: {
        status: 'abandoned',
        abandonedAt: abandonNow,
        endedAt: abandonNow,
        ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
        terminalMetadata: { outcome: 'abandoned', reason: 'no_human_players' },
      },
    })

    await prisma.lobbies.update({
      where: { id: lobby.id },
      data: { isActive: false },
    })

    await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'no_human_players' })
    await cleanupTurnReminderNotifications(log, activeGame.id)
    notifyLobbyListUpdate()

    return {
      status: 200,
      body: { message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true },
    }
  }

  // End the game when the remaining roster can no longer satisfy this game's minimum player count.
  if (remainingPlayers < minPlayersRequired) {
    const abandonNow = new Date()
    const abandonDuration = activeGame.startedAt instanceof Date
      ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
      : null
    await prisma.games.update({
      where: { id: activeGame.id },
      data: {
        status: 'abandoned',
        abandonedAt: abandonNow,
        endedAt: abandonNow,
        ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
        terminalMetadata: { outcome: 'abandoned', reason: 'insufficient_players' },
      },
    })

    await prisma.lobbies.update({
      where: { id: lobby.id },
      data: { isActive: false },
    })

    await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'insufficient_players' })
    await cleanupTurnReminderNotifications(log, activeGame.id)
    notifyLobbyListUpdate()

    return {
      status: 200,
      body: { message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true },
    }
  }

  // End game if 1 human remains with no bots in a formerly multi-human game.
  const remainingBots = remainingPlayers - remainingHumanPlayers
  if (remainingHumanPlayers === 1 && remainingBots === 0 && activeGame.players.length > 1) {
    const abandonNow = new Date()
    const abandonDuration = activeGame.startedAt instanceof Date
      ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
      : null
    await prisma.games.update({
      where: { id: activeGame.id },
      data: {
        status: 'abandoned',
        abandonedAt: abandonNow,
        endedAt: abandonNow,
        ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
        terminalMetadata: { outcome: 'abandoned', reason: 'insufficient_players' },
      },
    })
    await prisma.lobbies.update({ where: { id: lobby.id }, data: { isActive: false } })
    await emitLobbyEvent(log, code, 'game-abandoned', { reason: 'insufficient_players' })
    await cleanupTurnReminderNotifications(log, activeGame.id)
    notifyLobbyListUpdate()
    return {
      status: 200,
      body: { message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true },
    }
  }

  const gameMeta = getGameMetadata(activeGame.gameType)

  // Some games cannot meaningfully continue when a specific role leaves
  // (Spy without its spy) — which role, and the abandon reason, come from
  // catalog metadata rather than per-game branching here (#759).
  const roleRule = gameMeta?.abandonWhenRoleLeaves
  if (roleRule) {
    try {
      const roleState = parseAndValidateGameState(activeGame.state)
      const rolePlayerId = (roleState.data as Record<string, unknown> | null)?.[roleRule.stateDataKey]
      if (rolePlayerId === userId) {
        const abandonNow = new Date()
        const abandonDuration = activeGame.startedAt instanceof Date
          ? Math.floor((abandonNow.getTime() - activeGame.startedAt.getTime()) / 1000)
          : null
        await prisma.games.update({
          where: { id: activeGame.id },
          data: {
            status: 'abandoned',
            abandonedAt: abandonNow,
            endedAt: abandonNow,
            ...(abandonDuration !== null ? { durationSeconds: abandonDuration } : {}),
            terminalMetadata: { outcome: 'abandoned', reason: roleRule.reason },
          },
        })
        await prisma.lobbies.update({ where: { id: lobby.id }, data: { isActive: false } })
        await emitLobbyEvent(log, code, 'game-abandoned', { reason: roleRule.reason })
        await cleanupTurnReminderNotifications(log, activeGame.id)
        notifyLobbyListUpdate()
        return {
          status: 200,
          body: { message: 'You left the lobby', gameEnded: true, gameAbandoned: true, lobbyDeactivated: true },
        }
      }
    } catch (e) {
      log.warn('Failed to check critical role on player leave', { error: e, gameType: activeGame.gameType })
    }
    // Non-critical player left: fall through to the generic handling below
  }

  // For turn-based games: mark the departed player inactive and move the turn off them.
  // Alias uses currentTeamIndex+describerIndex; Liar's Party uses claimantOrder — skip
  // to avoid state corruption. Timer will handle stuck turns for those games.
  let turnAdvanced = false
  if (gameMeta?.advanceTurnOnLeave) {
    try {
      const parsedState = parseAndValidateGameState(activeGame.state)
      const currentPlayerId = parsedState.players[parsedState.currentPlayerIndex]?.id
      const leaverWasCurrent = currentPlayerId === userId

      // #992: this used to do nothing at all unless the leaver happened to hold the
      // turn, and even then it only bumped the index — the departed player stayed a
      // fully valid seat, because `GameEngine.removePlayer` refuses to drop anyone
      // while a game is playing. So the modulo wheel came back round to them and the
      // match froze on a greyed-out ghost that nobody could skip: no client submits a
      // timeout for a foreign seat, and these game types have no server-side fallback.
      // `setPlayerConnectionInState` and `advanceTurnPastDisconnectedPlayers` were both
      // written for this and the first had no caller anywhere, which left the per-move
      // skip in the move and bot-turn routes permanently inert.
      // `user.bot` is a relation and the shared include does not pull it, so ask
      // directly rather than widening a type every other caller pays for.
      const botUserIds = new Set(
        (
          await prisma.players.findMany({
            where: { gameId: activeGame.id, user: { bot: { isNot: null } } },
            select: { userId: true },
          })
        ).map((p) => p.userId)
      )
      const markedInactive = setPlayerConnectionInState(
        parsedState as unknown as TurnState,
        userId,
        false
      )

      if (leaverWasCurrent) {
        // Reset the departed player's turn scratch data so the next player
        // starts clean — which fields, and their reset values, come from
        // catalog metadata rather than duck-typing every game here (#759).
        const data = parsedState.data as Record<string, unknown> | null | undefined
        if (data && typeof data === 'object' && gameMeta.turnResetOnLeave) {
          for (const [key, value] of Object.entries(gameMeta.turnResetOnLeave)) {
            if (value === undefined) delete data[key]
            else if (key in data) data[key] = value
          }
          // #990: clearing the tracking arrays is not enough — the cards the
          // departed player had turned over stayed face up, which is a state the
          // engine never produces. Memory's bot reads "two unmatched cards face
          // up" as "a pair is mid-resolution", refused to move, and ended the
          // turn without ending it: the game could not be finished. Anything
          // card-shaped gets turned back down with the arrays it belongs to.
          if (Array.isArray(data.cards)) {
            data.cards = (data.cards as Array<Record<string, unknown>>).map((card) =>
              card && typeof card === 'object' && card.isFlipped === true && card.isMatched !== true
                ? { ...card, isFlipped: false }
                : card
            )
          }
        }
      }

      // Runs whoever left: it steps off the seat when the leaver held the turn, and
      // off any seat already marked inactive when the wheel reaches one later.
      const advance = advanceTurnPastDisconnectedPlayers(
        parsedState as unknown as TurnState,
        botUserIds
      )

      if (markedInactive || advance.changed) {
        await prisma.games.update({
          where: { id: activeGame.id },
          data: { state: toPersistedGameStateInput(parsedState) },
        })
        turnAdvanced = advance.changed
        if (advance.skippedPlayerIds.length > 0) {
          log.info('Skipped departed players when advancing the turn', {
            gameId: activeGame.id,
            skippedPlayerIds: advance.skippedPlayerIds,
            currentPlayerId: advance.currentPlayerId,
          })
        }
        await emitLobbyEvent(log, code, 'game-update', { action: 'state-change', payload: parsedState })
      }
    } catch (e) {
      log.warn('Failed to advance turn after player left mid-game', { error: e })
    }
  }

  // Engine-managed games: delegate player-leave state mutation to the engine
  if (gameMeta?.engineHandlesLeave) {
    try {
      const engine = restoreGameEngine(activeGame.gameType, activeGame.id, activeGame.state)
      const changed = engine.handlePlayerLeave(userId)
      if (changed) {
        const newState = engine.getState()
        await prisma.games.update({
          where: { id: activeGame.id },
          data: { state: toPersistedGameStateInput(newState) },
        })
        await emitLobbyEvent(log, code, 'game-update', { action: 'state-change', payload: newState })
      }
    } catch (e) {
      log.warn('Failed to apply engine handlePlayerLeave', { error: e, gameType: activeGame.gameType })
    }
  }

  await emitLobbyEvent(log, code, 'player-left', playerLeftEventPayload)
  if (reassignedCreator) {
    await emitLobbyEvent(log, code, 'lobby-update', {
      lobbyCode: code,
      type: 'player-left',
      data: {
        creatorId: reassignedCreator.userId,
        creatorName: reassignedCreator.username,
      },
    })
  }

  log.info('Player left, game continues', { code, userId, remainingPlayers, turnAdvanced })

  return {
    status: 200,
    body: { message: 'You left the lobby', gameEnded: false, lobbyDeactivated: false },
  }
}
