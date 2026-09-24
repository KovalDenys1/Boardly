import { GameStatus, Prisma } from '@/prisma/client'
import { prisma } from '@/lib/db'
import { decodeReplayState, encodeReplayState } from '@/lib/game-replay'

/**
 * What an erased player is called in every game record that outlives them.
 *
 * Stored data, not UI copy: other players' finished games and replays keep
 * their shape and their scores, only the name that pointed at a person goes.
 * GDPR Art. 17(1)(a) (#1128).
 */
export const DELETED_PLAYER_NAME = 'Deleted player'

export interface ErasedIdentity {
  id: string
  username: string | null
}

/** Keys that identify the person an object describes. */
const OWN_ID_KEYS = ['id', 'userId', 'playerId'] as const
/** Keys that name the person an object describes, when one of OWN_ID_KEYS is theirs. */
const OWN_NAME_KEYS = ['name', 'username', 'userName', 'playerName', 'displayName'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scrubObject(
  node: Record<string, unknown>,
  identities: ErasedIdentity[]
): Record<string, unknown> | null {
  let next: Record<string, unknown> | null = null
  const set = (key: string) => {
    if (typeof node[key] !== 'string' || node[key] === DELETED_PLAYER_NAME) return
    next ??= { ...node }
    next[key] = DELETED_PLAYER_NAME
  }

  const ownId = OWN_ID_KEYS.map((key) => node[key]).find((value) => typeof value === 'string')

  for (const identity of identities) {
    // { id: 'team-2', name: 'Denys', playerIds: ['<their id>'] } – an object
    // whose only member is this player is theirs even though its own id is not:
    // Alias names each solo team after its one player (lib/games/alias.ts).
    // A single member only, so a shared team called "Team 1" stays "Team 1"
    // even when one of its members once picked that name.
    const isSoleMember = Object.values(node).some(
      (value) => Array.isArray(value) && value.length === 1 && value[0] === identity.id
    )

    // { id, name } – the Player shape every engine stores in state.players.
    if (OWN_ID_KEYS.some((key) => node[key] === identity.id)) {
      OWN_NAME_KEYS.forEach(set)
    }

    for (const [key, value] of Object.entries(node)) {
      // { askerId, askerName } – a name paired with the id beside it (Spy's
      // question log, Yahtzee's results rows).
      if (key.endsWith('Id') && key.length > 2 && value === identity.id) {
        set(`${key.slice(0, -2)}Name`)
      }

      // A name with no id beside it at all. Matched on the exact username and
      // only where nothing says the object is somebody else, so a team called
      // "Team 1" is left alone even if a player once picked that name. A solo
      // team (isSoleMember) counts as theirs.
      if (
        identity.username &&
        value === identity.username &&
        /name$/i.test(key) &&
        (ownId === undefined || ownId === identity.id || isSoleMember)
      ) {
        const pairedId = key.length > 4 ? node[`${key.slice(0, -4)}Id`] : undefined
        if (pairedId === undefined || pairedId === identity.id) set(key)
      }
    }
  }

  return next
}

/**
 * Replaces the names of erased players inside any stored JSON (game state,
 * snapshot state, action payloads). Returns the input untouched, by reference,
 * when nothing matched, so callers can skip the write.
 */
export function scrubErasedPlayers(
  value: unknown,
  identities: ErasedIdentity[]
): { value: unknown; changed: boolean } {
  if (identities.length === 0) return { value, changed: false }

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const result = scrubErasedPlayers(item, identities)
      changed ||= result.changed
      return result.value
    })
    return changed ? { value: next, changed } : { value, changed: false }
  }

  if (!isPlainObject(value)) return { value, changed: false }

  let changed = false
  let current: Record<string, unknown> = scrubObject(value, identities) ?? value
  if (current !== value) changed = true

  for (const [key, child] of Object.entries(current)) {
    const result = scrubErasedPlayers(child, identities)
    if (result.changed) {
      if (current === value) current = { ...value }
      current[key] = result.value
      changed = true
    }
  }

  return changed ? { value: current, changed } : { value, changed: false }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/**
 * Every game an erased player can still be named in: the ones they have a
 * Players row on, the ones whose state mentions their id (a player who left
 * mid-game loses the row but stays in the move log), and the ones they made a
 * recorded move in.
 */
async function findGamesNaming(identities: ErasedIdentity[]): Promise<string[]> {
  const ids = identities.map((identity) => identity.id)
  const patterns = ids.map((id) => `%${escapeLike(id)}%`)

  const [players, stateRows, snapshotRows] = await Promise.all([
    prisma.players.findMany({ where: { userId: { in: ids } }, select: { gameId: true } }),
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "Games" WHERE state::text LIKE ANY(${patterns})`
    ),
    prisma.gameStateSnapshots.findMany({
      where: { playerId: { in: ids } },
      select: { gameId: true },
      distinct: ['gameId'],
    }),
  ])

  return Array.from(
    new Set([
      ...players.map((row) => row.gameId),
      ...stateRows.map((row) => row.id),
      ...snapshotRows.map((row) => row.gameId),
    ])
  )
}

/**
 * Games that will never move again. Their updatedAt is read as when the game
 * ended (GameHistory's date, getGameEndedAt) and as which game in a lobby is
 * the latest (lib/lobby-series-transition.ts, the Play again roster in
 * app/api/game/create), so a scrub must not bump it.
 */
const TERMINAL_GAME_STATUSES: ReadonlySet<GameStatus> = new Set<GameStatus>([
  GameStatus.finished,
  GameStatus.abandoned,
  GameStatus.cancelled,
])

async function scrubGameState(gameId: string, identities: ErasedIdentity[]): Promise<boolean> {
  // Two attempts: the write is guarded on updatedAt so a move landing between
  // our read and our write is never overwritten with the older state.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const game = await prisma.games.findUnique({
      where: { id: gameId },
      select: { state: true, status: true, updatedAt: true },
    })
    if (!game) return false

    const result = scrubErasedPlayers(game.state, identities)
    if (!result.changed) return false

    // A finished game keeps its timestamp: Prisma sets @updatedAt to now unless
    // the write names a value. A waiting or playing game gets a fresh one, so a
    // concurrent mover's own updatedAt guard sees that the state changed.
    const written = await prisma.games.updateMany({
      where: { id: gameId, updatedAt: game.updatedAt },
      data: {
        state: result.value as Prisma.InputJsonValue,
        ...(TERMINAL_GAME_STATUSES.has(game.status) ? { updatedAt: game.updatedAt } : {}),
      },
    })
    if (written.count > 0) return true
  }
  return false
}

async function scrubGameSnapshots(gameId: string, identities: ErasedIdentity[]): Promise<number> {
  const snapshots = await prisma.gameStateSnapshots.findMany({
    where: { gameId },
    select: { id: true, stateCompressed: true, stateEncoding: true, actionPayload: true },
  })

  let rewritten = 0
  for (const snapshot of snapshots) {
    const state = scrubErasedPlayers(
      decodeReplayState(snapshot.stateCompressed, snapshot.stateEncoding),
      identities
    )
    const payload = scrubErasedPlayers(snapshot.actionPayload, identities)
    if (!state.changed && !payload.changed) continue

    await prisma.gameStateSnapshots.update({
      where: { id: snapshot.id },
      data: {
        ...(state.changed ? await encodeReplayState(state.value) : {}),
        ...(payload.changed ? { actionPayload: payload.value as Prisma.InputJsonValue } : {}),
      },
    })
    rewritten += 1
  }
  return rewritten
}

/**
 * Removes the names of the given players from Games.state and from every
 * replay snapshot of those games. Ids stay – they no longer resolve to anyone
 * once the Users row is gone – so scores, placements and turn order survive.
 */
export async function scrubPlayersFromGameRecords(
  identities: ErasedIdentity[]
): Promise<{ games: number; snapshots: number }> {
  if (identities.length === 0) return { games: 0, snapshots: 0 }

  const gameIds = await findGamesNaming(identities)
  let games = 0
  let snapshots = 0
  for (const gameId of gameIds) {
    if (await scrubGameState(gameId, identities)) games += 1
    snapshots += await scrubGameSnapshots(gameId, identities)
  }
  return { games, snapshots }
}

/**
 * Feedback survives an account on purpose (onDelete: SetNull keeps the
 * product signal), but the reply address and the link to the person do not.
 * Matches by user id and, for an account with a real address, by that address,
 * so feedback sent while signed out is covered too.
 */
export async function detachFeedbackFrom(userIds: string[], email?: string | null): Promise<number> {
  const conditions: Prisma.FeedbackWhereInput[] = []
  if (userIds.length > 0) conditions.push({ userId: { in: userIds } })
  if (email) conditions.push({ email: { in: Array.from(new Set([email, email.toLowerCase()])) } })
  if (conditions.length === 0) return 0

  const result = await prisma.feedback.updateMany({
    where: { OR: conditions },
    data: { email: null, userId: null },
  })
  return result.count
}
