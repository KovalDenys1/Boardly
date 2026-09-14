import { createHmac } from 'node:crypto'
import { prisma } from './db'
import { apiLogger } from './logger'
import type { GameType } from '@/prisma/client'

const log = apiLogger('lobby-participation')

/**
 * Records who took part in a lobby, for analytics that must outlive the person.
 *
 * Guest users are hard-deleted after three days of inactivity and
 * `Players.userId` cascades, so the roster of 49% of all games had already been
 * destroyed and the usable analytics window was four days (#816). This table
 * has no relation to `Users`, so the purge cannot reach it.
 *
 * Written on join rather than on game start, because 28% of lobbies never start
 * and "how many people were sitting in one" is exactly the question that could
 * not be answered.
 */
function participantKey(userId: string): string {
  // Salted so the value cannot be reversed to a user id or joined back to a
  // deleted guest — the point is anonymised aggregates, not longer retention of
  // personal data. Falls back to the auth secret so there is no silent
  // unsalted mode if the dedicated variable is unset.
  const salt = process.env.PARTICIPATION_HASH_SALT || process.env.NEXTAUTH_SECRET
  if (!salt) {
    throw new Error('PARTICIPATION_HASH_SALT or NEXTAUTH_SECRET must be set')
  }
  return createHmac('sha256', salt).update(userId).digest('hex').slice(0, 32)
}

export async function recordLobbyParticipation(params: {
  lobbyId: string
  lobbyCode: string
  gameType: GameType
  userId: string
  isBot?: boolean
  isGuest?: boolean
  /** Copied from the user at join, because the user row may not survive the week. */
  signupSource?: string | null
}): Promise<void> {
  try {
    await prisma.lobbyParticipations.create({
      data: {
        lobbyId: params.lobbyId,
        lobbyCode: params.lobbyCode,
        gameType: params.gameType,
        participantKey: participantKey(params.userId),
        isBot: params.isBot ?? false,
        isGuest: params.isGuest ?? false,
        signupSource: params.signupSource ?? null,
      },
    })
  } catch (err) {
    // A repeat join is expected (rejoin after a refresh) and the unique
    // constraint absorbs it. Anything else is logged and swallowed: an
    // analytics write must never stop someone joining a game.
    const isDuplicate =
      typeof err === 'object' && err !== null && 'code' in err &&
      (err as { code?: string }).code === 'P2002'
    if (!isDuplicate) {
      log.error('Failed to record lobby participation', err instanceof Error ? err : new Error(String(err)), {
        lobbyId: params.lobbyId,
      })
    }
  }
}

/** Exposed for tests — the hash must be stable and must not leak the user id. */
export const __participantKeyForTests = participantKey
