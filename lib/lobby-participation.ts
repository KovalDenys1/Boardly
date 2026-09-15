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
}): Promise<boolean> {
  let created: { joinedAt: Date } | null = null
  try {
    created = await prisma.lobbyParticipations.create({
      data: {
        lobbyId: params.lobbyId,
        lobbyCode: params.lobbyCode,
        gameType: params.gameType,
        participantKey: participantKey(params.userId),
        isBot: params.isBot ?? false,
        isGuest: params.isGuest ?? false,
        signupSource: params.signupSource ?? null,
      },
      select: { joinedAt: true },
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

  if (created && !params.isBot) {
    await recordSecondHumanJoined({ ...params, joinedAt: created.joinedAt })
  }

  return created !== null
}

/**
 * The invite loop's outcome metric (#920): a lobby that reaches a second non-bot
 * participant. Written server-side because the public beacon enum is forgeable, and a
 * rate anyone could post with any lobby code is worse than none. Bots are excluded
 * because a bot-filled Quick Play lobby is not an invite that worked.
 *
 * Counts only rows joined at or before the row this call created. The count runs
 * outside the join transaction, so two humans joining the same lobby at once (Quick
 * Play sends both to the fullest open lobby) would otherwise each see three and
 * neither would fire. Rows in the same millisecond still tie, and the earlier one
 * cannot tell it was earlier; that undercount is accepted, a double count is not.
 *
 * Never throws: an analytics write must not stop someone joining a game.
 */
async function recordSecondHumanJoined(params: {
  lobbyId: string
  lobbyCode: string
  gameType: GameType
  isGuest?: boolean
  signupSource?: string | null
  joinedAt: Date
}): Promise<void> {
  try {
    const humans = await prisma.lobbyParticipations.count({
      where: { lobbyId: params.lobbyId, isBot: false, joinedAt: { lte: params.joinedAt } },
    })
    if (humans !== 2) return

    await prisma.operationalEvents.create({
      data: {
        eventName: 'second_human_joined',
        metricType: 'flow',
        gameType: params.gameType,
        isGuest: params.isGuest ?? false,
        source: params.signupSource ?? null,
        payload: { lobby_code: params.lobbyCode },
      },
    })
  } catch (err) {
    log.error('Failed to record second_human_joined', err instanceof Error ? err : new Error(String(err)), {
      lobbyId: params.lobbyId,
    })
  }
}

/** Exposed for tests — the hash must be stable and must not leak the user id. */
export const __participantKeyForTests = participantKey
