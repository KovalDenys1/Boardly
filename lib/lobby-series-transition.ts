import { prisma } from '@/lib/db'
import type { GameType } from '@/prisma/client'
import { createGameEngine } from '@/lib/game-registry'
import { toPersistedGameStateInput } from '@/lib/persisted-game-state'
import { broadcastToLobby } from '@/lib/supabase-server'

interface TransitionPlayer {
  userId: string
  user?: { bot?: unknown } | null
}

interface TransitionParams {
  lobbyId: string
  lobbyCode: string
  gameType: string
  /** Players from the just-finished game. */
  players: TransitionPlayer[]
}

/**
 * Creates a fresh `waiting` Games row for the lobby, carries over human
 * (non-bot) players, reactivates the lobby, and broadcasts `game-reset` so
 * all connected clients transition back to the waiting room.
 *
 * Shared by the manual "Return to Lobby" host action and the automatic
 * series-complete trigger fired from the move-processing routes.
 */
export async function transitionLobbyToWaitingRoom(params: TransitionParams): Promise<{ gameId: string }> {
  const { lobbyId, lobbyCode, gameType, players } = params
  const humanPlayers = players.filter((p) => !p.user?.bot)

  const initialState = createGameEngine(gameType, 'temp').getState()

  const newGame = await prisma.$transaction(async (tx) => {
    const game = await tx.games.create({
      data: {
        lobbyId,
        gameType: gameType as GameType,
        state: toPersistedGameStateInput(initialState),
        status: 'waiting',
      },
      select: { id: true },
    })

    await tx.players.createMany({
      data: humanPlayers.map((p, i) => ({
        gameId: game.id,
        userId: p.userId,
        position: i,
        scorecard: JSON.stringify({}),
      })),
      skipDuplicates: true,
    })

    return game
  })

  await prisma.lobbies.update({
    where: { id: lobbyId },
    data: { isActive: true },
  })

  await broadcastToLobby(lobbyCode, 'game-reset', { lobbyCode, gameId: newGame.id })

  return { gameId: newGame.id }
}
