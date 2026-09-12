import { prisma } from './db'
import { apiLogger } from './logger'

const log = apiLogger('lobby-limit')

/**
 * One open lobby per person (#907).
 *
 * A host can change the game inside a lobby they already have
 * (`PATCH /api/lobby/[code]`), so a second lobby buys them nothing and costs
 * everyone else: on 2026-09-12 one guest held four simultaneous bot games, all
 * `isActive` and therefore all in the public list, which at 5-16 players a day
 * is a visible share of it.
 *
 * "Per person", not "per account". The guard this replaces began
 * `if (!requestUser.isGuest)`, and guests create 87% of lobbies — so it did not
 * apply to the people who make almost all of them. A guest token identifies a
 * guest exactly as well as a session identifies a user.
 *
 * Lives here because two routes create lobbies: `POST /api/lobby` and
 * `POST /api/quick-play`. The reported case came through quick-play, so a
 * limit that only guarded the other one would have changed nothing.
 */

export type LobbyLimitVerdict =
  /** Nothing in the way. */
  | { kind: 'clear' }
  /** The creator already has a lobby open; the caller should send them to it. */
  | { kind: 'blocked'; lobbyCode: string }

/**
 * One rule, no exceptions: if the creator already has a lobby with a game in
 * `waiting` or `playing`, they cannot make another.
 *
 * An earlier draft tried to be clever and quietly closed a `waiting` room that
 * held nobody but its creator, on the theory that it was abandoned. Tested
 * against a running server, that turned out to exempt almost every case — a
 * lobby is `waiting` with one player for the entire time between creating it
 * and someone joining, which is exactly when a second one gets made. The
 * limit never bit.
 *
 * So it always blocks, and the kindness lives on the client instead: a refusal
 * carries the existing lobby's code and both callers send the player there
 * rather than showing an error. That is where they wanted to be anyway, and
 * they can change the game from inside it.
 *
 * A genuinely abandoned room is not this function's problem. `waiting` games
 * idle for `LOBBY_CLEANUP_WAITING_STALE_HOURS` (0.5) are closed by
 * `cleanupStaleLobbiesAndGames`, and a player who gets sent back to a room they
 * no longer want can leave it from there.
 */
export async function checkOpenLobbyLimit(creatorId: string): Promise<LobbyLimitVerdict> {
  const existing = await prisma.lobbies.findFirst({
    where: {
      creatorId,
      games: { some: { status: { in: ['waiting', 'playing'] } } },
    },
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  })

  if (!existing) return { kind: 'clear' }

  log.info('Refused a second lobby', { creatorId, existingLobby: existing.code })
  return { kind: 'blocked', lobbyCode: existing.code }
}
